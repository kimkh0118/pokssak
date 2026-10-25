"""지원사업 파이프라인·상태·매칭·작업·알림."""

from datetime import datetime

from app import clock, db as dbm, jobs, notify, programs
from app.explain import validate
from app.seed import CHANGED_NOTICE, SAMPLE_NOTICES, seed_sample

KST = clock.KST


def test_예시자료_발행과_변경공고는_검토대기_HWP는_추출실패():
    out = seed_sample()
    assert out["published"] == 2
    assert out["changed"]["pendingReview"] and set(out["changed"]["important"]) >= {"benefitCap", "applyEnd"}
    assert out["hwp"]["extract"] == "failed"  # 예시 HWP는 실제 OLE 문서가 아닌 손상된 입력
    with dbm.connect() as c:
        assert c.execute("SELECT review_state FROM programs WHERE notice_key = 'sample-notice-1'").fetchone()[0] == "changing"


def test_같은_콘텐츠는_다시_처리하지_않음():
    seed_sample(with_change=False)
    key, url, text = SAMPLE_NOTICES[0]
    assert programs.ingest(key, url, text.encode(), "text/plain", is_sample=True)["unchanged"]


def test_원문_근거_없는_값은_비우고_지시문은_따르지_않음():
    data, errors = programs.validate_evidence(
        {"benefitCap": {"value": 99_000_000, "evidence": "최대 9,900만원"}, "title": {"value": "A", "evidence": "사업명: A"}},
        "사업명: A\n지원 금액: 최대 1,500만원")
    assert data["benefitCap"]["value"] is None and data["title"]["value"] == "A" and errors
    extracted = programs.structure_sample(SAMPLE_NOTICES[0][2])
    assert "확정" not in str(extracted.get("benefitType"))


def test_미검토_후보는_발행되지_않고_수정값도_근거_확인():
    seed_sample()
    with dbm.connect() as c:
        cid = c.execute("SELECT id FROM program_candidates WHERE status = 'pending'").fetchone()[0]
    pub = {p["data"]["benefitCap"]["value"] for p in programs.published() if p["data"]["title"]["value"].startswith("예시구 빈집")}
    assert pub == {15_000_000}  # 검토 전에는 기존 발행본 유지
    try:
        programs.publish(cid, "admin", edited={"benefitCap": {"value": 1, "evidence": "없는 문장"}})
        raise AssertionError("근거 없는 수정이 발행됨")
    except programs.ReviewError:
        pass
    programs.publish(cid, "admin")
    with dbm.connect() as c:
        assert c.execute("SELECT COUNT(*) FROM program_versions WHERE program_id = (SELECT program_id FROM program_candidates WHERE id = ?)",
                         (cid,)).fetchone()[0] == 2  # 이전 버전 보존


def test_신청상태는_한국시간으로_재평가():
    d = {"applyStart": {"value": "2026-10-01"}, "applyEnd": {"value": "2026-11-30"}, "applyEndTime": {"value": "18:00"}}
    assert programs.program_status(d, datetime(2026, 11, 30, 17, 59, tzinfo=KST)) == "접수중"
    assert programs.program_status(d, datetime(2026, 11, 30, 18, 1, tzinfo=KST)) == "마감"
    assert programs.program_status(d, datetime(2026, 9, 30, 23, 0, tzinfo=KST)) == "예정"
    assert programs.program_status({}, None) == "미확인"
    assert programs.program_status({**d, "statusOverride": {"value": "예산 소진"}}) == "예산소진"


def test_매칭은_미확인을_통과로_보지_않음():
    seed_sample(with_change=False)
    p = next(x for x in programs.published() if x["data"]["title"]["value"].startswith("예시구 빈집"))
    full = programs.match(p, {"sggName": "예시구", "housingType": "단독주택", "vacancyMonths": 24, "ownership": "single", "ownershipLabel": "단독"})
    assert full["result"] == "needs_check"  # 사전 승인·예산 등 확인 필요
    no_vac = programs.match(p, {"sggName": "예시구", "housingType": "단독주택", "vacancyMonths": None, "ownership": "single"})
    assert any(i["label"] == "공실 기간" and i["status"] == "unknown" for i in no_vac["items"])
    other = programs.match(p, {"sggName": "다른구", "housingType": "단독주택", "vacancyMonths": 24, "ownership": "single"})
    assert other["result"] == "mismatch"


def test_작업_잠금과_재시도_실패기록():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise RuntimeError("일시 오류")
        return {"ok": 1}

    r = jobs.run("t", "manual", flaky, retry_delays=(0,))
    assert r["status"] == "succeeded" and calls["n"] == 2
    assert jobs.acquire("t2")
    assert jobs.run("t2", "manual", lambda: 1)["status"] == "skipped_locked"
    bad = jobs.run("t3", "manual", lambda: 1 / 0, retry_delays=(0,))
    assert bad["status"] == "failed" and "ZeroDivisionError" in bad["error"]


def test_예약시각은_한국시간_월요일_9시():
    assert jobs.next_run("MON 09:00", datetime(2026, 10, 22, 10, 0, tzinfo=KST)).isoformat() == "2026-10-26T09:00:00+09:00"
    assert jobs.next_run("MON 09:00", datetime(2026, 10, 26, 8, 59, tzinfo=KST)).day == 26


def test_수집_실패해도_종료로_처리하지_않음():
    seed_sample(with_change=False)
    with dbm.connect() as c:
        c.execute("UPDATE program_sources SET auto_fetch_allowed = 1, list_url = 'http://127.0.0.1:9/none'")
    before = {p["id"]: p["status"] for p in programs.published()}
    out = jobs.collect()
    assert out["skipped"] or out["failed"]
    assert {p["id"]: p["status"] for p in programs.published()} == before


def test_AI_설명_검증():
    assert validate({"summary": "철거비가 1,000만 원이면 유리합니다", "nextSteps": []}, "hold")
    assert validate({"summary": "추천합니다", "nextSteps": []}, "hold")
    assert validate({"summary": "근거가 부족해 보류했습니다", "nextSteps": ["견적을 받아 보세요"]}, "hold") == []
    assert validate({"bad": 1}, "hold") == ["스키마 불일치"]


def test_종료_사업은_사용자_목록에서_자동_제외_삭제_복구():
    from datetime import datetime
    from app import clock
    seed_sample(with_change=False)
    users = lambda: programs.published(active_only=True)
    before = {p["id"] for p in users()}
    assert before
    clock.set_now(datetime(2027, 1, 1, 10, 0, tzinfo=clock.KST))  # 예시 공고 마감(2026-11-30) 이후
    ended = [p for p in programs.published() if p["status"] == "마감"]
    assert ended and not {p["id"] for p in ended} & {p["id"] for p in users()}
    clock.set_now(datetime(2026, 10, 22, 10, 0, tzinfo=clock.KST))
    pid = next(iter(before))
    programs.remove(pid, "admin@example.com", "중복 공고")
    assert pid not in {p["id"] for p in programs.published()}
    removed = [p for p in programs.published(include_removed=True) if p["id"] == pid][0]
    assert removed["removedReason"] == "중복 공고"
    programs.restore(pid)
    assert pid in {p["id"] for p in users()}
