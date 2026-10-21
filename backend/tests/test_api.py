"""API 전체 흐름: 주소 → 조회 → 분석 → 조건 수정 → 상담 신청 (예시 모드)."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
ANSWERS = {
    "purpose": "best_price", "timing": "flexible", "occupancy": "tenant", "condition": "partial_repair",
    "tenant": {"deposit": {"status": "known", "won": 200_000_000}, "monthlyRent": {"status": "known", "won": 1_500_000},
               "leaseEnd": {"status": "unknown"}},
    "availableCash": {"status": "known", "won": 0},
    "loanBalance": {"status": "unknown"},
}


def sample_lookup(query: str, address_id: str) -> dict:
    found = client.get("/api/address", params={"mode": "sample", "q": query}).json()
    address = next(a for a in found["data"] if a["id"] == address_id)
    return client.post("/api/property", json={"mode": "sample", "address": address}).json()


def create(lookup_id: str, answers=ANSWERS, target=None):
    return client.post("/api/analyses", json={"lookupId": lookup_id, "answers": answers, "target": target or {}})


def test_실제모드_키_없으면_오류이고_예시데이터로_바꾸지_않음():
    r = client.get("/api/address", params={"mode": "live", "q": "세종대로 110"})
    assert r.status_code == 502
    assert r.json()["error"]["kind"] == "not_configured"
    assert "예시시" not in r.text


def test_예시모드_전체_흐름():
    prop = sample_lookup("예시로 34", "sample-multi")
    assert prop["scope"]["status"] == "supported"
    assert prop["land"]["ok"] and prop["buildings"]["ok"] and prop["trades"]["ok"]

    analysis_id = create(prop["id"], target={"buildingPk": "S-2001"}).json()["id"]
    a = client.get(f"/api/analyses/{analysis_id}").json()
    result = a["result"]
    assert len(result["options"]) == 4
    assert any("대출 잔액 반영 전" in p for p in result["globalPending"])
    assert "세금 반영 전" in result["globalPending"]
    assert a["answers"]["availableCash"] == {"status": "known", "won": 0}  # 0원은 0원(모름 아님)

    demolish = next(o for o in result["options"] if o["id"] == "demolish_sell_land")
    assert demolish["checks"]["budget"] == "exceeds"  # 현금 0원인데 보증금 반환·철거비 선투입 필요
    assert result["recommendation"]["optionId"] not in ("demolish_sell_land", "remodel")

    keep = next(o for o in result["options"] if o["id"] == "keep")
    assert not any(f["category"] == "sale" for f in keep["scenarios"]["base"]["flows"])
    assert keep["scenarios"]["base"]["terminal"] is not None

    # 계산 조건 수정
    updated = client.put(f"/api/analyses/{analysis_id}", json={
        "overrides": {"taxes": {"asIsSale": 30_000_000}, "horizonMonths": 48},
        "answers": {**ANSWERS, "loanBalance": {"status": "known", "won": 0}},
    }).json()
    sell = next(o for o in updated["result"]["options"] if o["id"] == "sell_as_is")
    assert sell["scenarios"]["base"]["saleSettlement"]["tax"] == 30_000_000
    assert updated["current"]["horizonMonths"] == 48
    assert not any("대출 잔액 반영 전" in p for p in updated["result"]["globalPending"])

    # 잘못된 조건
    bad = client.put(f"/api/analyses/{analysis_id}", json={"overrides": {"asIsPrice": {"low": 3, "base": 2, "high": 1}}})
    assert bad.status_code == 400 and "error" in bad.json()

    # 내 분석 요약
    summary = client.get("/api/analyses/summary", params={"ids": analysis_id}).json()["items"][0]
    assert summary["found"] and summary["address"].startswith("예시시")


def test_공동주택은_분석_거부():
    prop = sample_lookup("예시아파트", "sample-apt")
    assert prop["scope"]["status"] == "unsupported"
    assert create(prop["id"]).status_code == 422


def test_건물이_여러개면_대상_선택_필요():
    prop = sample_lookup("샘플길", "sample-two-bldg")
    assert len(prop["targetReasons"]) == 2
    assert create(prop["id"]).status_code == 422
    assert create(prop["id"], target={"buildingPk": "all"}).status_code == 200


def test_상담신청_동의와_연결대상_검사():
    prop = sample_lookup("예시로 12", "sample-house")
    analysis_id = create(prop["id"]).json()["id"]
    base = {"analysisId": analysis_id, "optionId": "sell_as_is", "partnerId": "sample-broker-1",
            "sharedFields": ["name", "phone"], "contactName": "테스트", "contactPhone": "010-0000-0000"}
    assert client.post("/api/consultations", json={**base, "consent": False}).status_code == 400
    assert client.post("/api/consultations", json={**base, "optionId": "keep", "consent": True}).status_code == 400
    ok = client.post("/api/consultations", json={**base, "consent": True}).json()
    assert ok["status"] == "received" and ok["partner"]["isSample"]
    listed = client.get(f"/api/analyses/{analysis_id}").json()["consultations"]
    assert len(listed) == 1 and "contactPhone" not in listed[0]  # 목록에 연락처 노출 안 함


def test_입력검증():
    assert client.post("/api/analyses", json={"lookupId": "x", "answers": {**ANSWERS, "purpose": "nope"}}).status_code == 400
    assert client.get("/api/address", params={"mode": "sample", "q": "a"}).status_code == 400


def test_새_질문_3개만으로_분석():
    prop = sample_lookup("예시로 12", "sample-house")
    answers = {"purpose": "quick_sale", "condition": "major_repair", "delayReason": "ownership"}
    analysis_id = create(prop["id"], answers=answers).json()["id"]
    a = client.get(f"/api/analyses/{analysis_id}").json()
    assert a["answers"]["timing"] == "within_6m"  # '빨리 정리'는 6개월 기준
    assert a["answers"]["occupancy"] == "unknown"
    rec = a["result"]["recommendation"]
    assert "소유관계" in rec["cautions"][0]
    sell = next(o for o in a["result"]["options"] if o["id"] == "sell_as_is")
    assert "소유관계" in sell["needsConfirmation"][0]


def test_수익창출과_재개발기대():
    prop = sample_lookup("예시로 12", "sample-house")
    answers = {"purpose": "profit", "condition": "good", "delayReason": "redevelopment"}
    a = client.get(f"/api/analyses/{create(prop['id'], answers=answers).json()['id']}").json()
    assert a["answers"]["timing"] == "flexible"
    remodel = next(o for o in a["result"]["options"] if o["id"] == "remodel")
    assert remodel["variant"] in ("remodel_sell", "remodel_rent")
    assert any("재개발" in c for c in a["result"]["recommendation"]["cautions"])


def test_서버_로그에_인증키_주소가_찍히지_않음():
    import logging
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
