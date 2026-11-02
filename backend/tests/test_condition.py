"""집 상태 점수 → 예상 집값 보정."""

from fastapi.testclient import TestClient

from app import condition
from app.main import app

BASE = {"ownership": "single", "usage": "vacant", "direction": "recovery", "condition": "old", "access": "narrow"}


def test_객관식만으로_기본_점수():
    a = condition.assess(BASE, None)
    keys = {i["key"]: i for i in a["items"]}
    assert keys["maintenance"]["score"] == -1 and keys["access"]["score"] == -1
    assert a["pct"] == -6.0 and a["source"] == "choices"


def test_주관식_키워드가_점수를_바꾼다():
    a = condition.assess(BASE, "지붕이 슬레이트고 비 오면 물이 새요. 형제 공동명의예요.")
    keys = {i["key"]: i for i in a["items"]}
    assert a["source"] == "rules"                      # 테스트는 키 없음 → 키워드 규칙
    assert keys["roof"]["score"] == -2 and keys["structure"]["score"] == -1 and keys["rights"]["score"] == -1
    assert "슬레이트" in keys["roof"]["evidence"]
    assert a["pct"] == -6 - 6 - 5 - 2                  # 관리 -3, 진입 -3, 지붕 -6, 누수 -5, 권리 -2


def test_좋은_상태는_올라가고_보정에는_한도():
    good = condition.assess(BASE | {"condition": "usable", "access": "good"}, "작년에 전면 리모델링했고 남향이라 햇볕 잘 들어요")
    assert good["pct"] > 0 and good["pct"] <= condition.MAX_PCT
    bad = condition.assess(BASE | {"condition": "severe", "access": "none", "usage": "occupied", "ownership": "joint"},
                           "폐가 수준이고 기울어 있어요. 슬레이트 지붕, 소송 중이고 공장 옆이라 냄새나요")
    assert bad["pct"] == condition.MIN_PCT and bad["capped"]


def test_적용하면_기본값을_남기고_범위도_같이_보정():
    house = {"value": 100_000_000, "range": {"min": 90_000_000, "max": 110_000_000}}
    out = condition.apply(house, {"pct": -10.0, "items": []})
    assert out["baseValue"] == 100_000_000 and round(out["value"]) == 90_000_000
    assert round(out["range"]["min"]) == 81_000_000


def test_분석에_저장되고_답을_고치면_다시_계산():
    with TestClient(app) as c:
        found = c.get("/api/address", params={"mode": "sample", "q": "예시"}).json()["data"]
        lk = c.post("/api/lookup", json={"mode": "sample", "address": next(a for a in found if a["id"] == "sample-vacant")}).json()
        aid = c.post("/api/analyses", json={"lookupId": lk["id"], "answers": BASE | {"notes": "비 오면 물이 새요"}}).json()["id"]
        r = c.get(f"/api/analyses/{aid}").json()
        assess = r["answers"]["assessment"]
        assert any(i["key"] == "structure" for i in assess["items"])
        house = r["reference"]["house"]
        if house.get("baseValue"):
            assert house["value"] < house["baseValue"] and house["condition"]["pct"] == assess["pct"]
        c.put(f"/api/analyses/{aid}", json={"answers": BASE | {"condition": "usable", "notes": "올수리 했어요"}})
        again = c.get(f"/api/analyses/{aid}").json()["answers"]["assessment"]
        assert again["pct"] > assess["pct"]
