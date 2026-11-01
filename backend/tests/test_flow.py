"""예시 데이터로 주소 입력 → 질문 → 참고 비교 → 상담 보완 → 재계산 → 플랜 → 저장 → 알림 전체 흐름과 권한."""

from fastapi.testclient import TestClient

from app.main import app

ANSWERS = {"ownership": "single", "usage": "vacant", "direction": "recovery", "condition": "old", "access": "narrow", "vacancyMonths": 24}
ITEMS = {k: "included" for k in ("demolition", "waste", "equipment", "asbestos", "admin", "vat", "cleanup")}


def consult(v, kind):
    return {"kind": "consult", "value": v, "priceType": kind, "scopeMatches": True, "source": "예시공인중개사",
            "checkedOn": "2026-10-10", "siteConditionShared": True}


COSTS = {p: {"kind": "consult", "value": 500_000} for p in ("tax", "holding", "finance", "cleanup", "other")}


def lookup(c, address_id="sample-vacant"):
    found = c.get("/api/address", params={"mode": "sample", "q": "예시"}).json()["data"]
    return c.post("/api/lookup", json={"mode": "sample", "address": next(a for a in found if a["id"] == address_id)}).json()


def test_실제모드_키없음은_오류이고_예시로_바꾸지_않음():
    with TestClient(app) as c:
        r = c.get("/api/address", params={"mode": "live", "q": "장대골로 19"})
        assert r.status_code == 502 and r.json()["error"]["kind"] == "not_configured" and "예시" not in r.text


def test_비회원_전체흐름과_재계산():
    with TestClient(app) as c:
        lk = lookup(c)
        assert {x["key"]: x["status"] for x in lk["checks"]} == {"busan": "pass", "type": "pass", "scope": "pass", "consistency": "pass"}
        assert lk["landUse"]["ok"] and lk["houseTrades"]["ok"] and lk["landTrades"]["ok"]
        aid = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": ANSWERS}).json()["id"]
        a = c.get(f"/api/analyses/{aid}").json()
        assert a["eligibility"]["amountRecommendationAllowed"]
        assert a["reference"]["house"]["status"] == "median" and a["reference"]["land"]["status"] == "median"
        assert a["result"]["status"] == "hold"  # 공공 참고가격만으로는 추천하지 않음
        assert a["result"]["calc"]["withoutSupport"]["base"]["K"] is not None  # 참고 비교는 제공
        assert a["remodel"]["enabled"] is False and len(a["plan"]) == 6

        upd = c.put(f"/api/analyses/{aid}", json={"inputs": {
            "H": consult(240_000_000, "as_is"), "L": consult(330_000_000, "land"),
            "D": {"quote": {"kind": "consult", "value": 25_000_000, "source": "예시철거", "checkedOn": "2026-10-12", "items": ITEMS}},
            "C_H": COSTS, "C_L": COSTS, "period_H": {"kind": "consult", "value": 3, "unit": "개월"},
            "period_L": {"kind": "consult", "value": 8, "unit": "개월"}, "funding": {"prefund": "yes", "available": 40_000_000},
        }}).json()
        assert upd["result"]["status"] == "conditional" and upd["result"]["executionRecommendation"] == "demolish"
        assert upd["explanation"]["source"] == "rule"
        bad = c.put(f"/api/analyses/{aid}", json={"inputs": {"H": {"kind": "consult"}}})
        assert bad.status_code == 400

    with TestClient(app) as other:  # 다른 브라우저(쿠키 없음)
        assert other.get(f"/api/analyses/{aid}").status_code == 403


def test_소유_점유_짐보관_경로():
    with TestClient(app) as c:
        lk = lookup(c)
        for answers, expect in [({"ownership": "joint"}, "공동"), ({"usage": "occupied"}, "임차인"),
                                ({"usage": "storage"}, "짐·가구"), ({"ownership": "other"}, "기타"), ({"corporate": True}, "법인")]:
            aid = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": {**ANSWERS, **answers}}).json()["id"]
            a = c.get(f"/api/analyses/{aid}").json()
            assert not a["eligibility"]["amountRecommendationAllowed"]
            assert any(expect in r for r in a["eligibility"]["holdReasons"]), (answers, a["eligibility"]["holdReasons"])
            assert a["public"]["land"]["ok"]  # 보류여도 공개 기본정보 제공
        aid = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": {**ANSWERS, "usage": "storage",
                                                                               "storageFollowup": {"inUse": "no", "cleanupKnown": "yes"}}}).json()["id"]
        assert c.get(f"/api/analyses/{aid}").json()["eligibility"]["amountRecommendationAllowed"]


def test_범위가_불명확하면_금액_보류_공동주택_보류():
    with TestClient(app) as c:
        lk = lookup(c, "sample-two")
        aid = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": ANSWERS}).json()["id"]
        assert any("범위" in r for r in c.get(f"/api/analyses/{aid}").json()["eligibility"]["holdReasons"])
        apt = lookup(c, "sample-apt")
        assert any(x["key"] == "type" and x["status"] == "fail" for x in apt["checks"])


def test_회원_자동저장_중복방지_삭제_권한():
    with TestClient(app) as c:
        c.post("/api/auth/signup", json={"email": "u1@example.com", "password": "password123"})
        assert c.post("/api/auth/login", json={"email": "u1@example.com", "password": "password123"}).status_code == 200
        lk = lookup(c)
        first = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": ANSWERS}).json()
        second = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": ANSWERS}).json()
        assert first["saved"]["created"] and not second["saved"]["created"]
        assets = c.get("/api/assets").json()["assets"]
        assert len(assets) == 1
        assert c.delete(f"/api/assets/{assets[0]['id']}").json()["ok"] and c.get("/api/assets").json()["assets"] == []
        aid = second["id"]
    with TestClient(app) as c2:
        c2.post("/api/auth/signup", json={"email": "u2@example.com", "password": "password123"})
        c2.post("/api/auth/login", json={"email": "u2@example.com", "password": "password123"})
        assert c2.get(f"/api/analyses/{aid}").status_code == 403


def test_정보확인_단계에서_관심집_저장하고_나중에_답하면_draft_해제():
    with TestClient(app) as c:
        c.post("/api/auth/signup", json={"email": "w@example.com", "password": "password1"})
        c.post("/api/auth/login", json={"email": "w@example.com", "password": "password1"})
        lk = lookup(c)
        r = c.post(f"/api/lookups/{lk['id']}/watch", json={"buildingKey": None, "costsSeparable": False})
        assert r.status_code == 200 and r.json()["saved"]["created"] is True
        aid = r.json()["analysisId"]
        assert len(c.get("/api/assets").json()["assets"]) == 1
        again = c.post(f"/api/lookups/{lk['id']}/watch", json={"buildingKey": None, "costsSeparable": False}).json()
        assert again["saved"]["created"] is False  # 같은 집은 한 번만
        assert c.get(f"/api/analyses/{aid}").json()["answers"]["draft"] is True
        c.put(f"/api/analyses/{aid}", json={"answers": ANSWERS})
        assert "draft" not in c.get(f"/api/analyses/{aid}").json()["answers"]


def test_정보확인_단계_저장은_로그인_필요():
    with TestClient(app) as c:
        lk = lookup(c)
        assert c.post(f"/api/lookups/{lk['id']}/watch", json={}).status_code == 401
