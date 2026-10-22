"""정부24 어댑터·부산시 고시공고 크롤러·robots 처리(가짜 응답, 실제 사이트 접속 없음)."""

import httpx

from app import db as dbm, jobs, programs
from app.adapters import busan_gosi, gov24
from app.settings import settings

LIST_HTML = """<table><tbody>
<tr><td>2026-1</td><td class="title"><a href="/nbgosi/view?sno=101&gosiGbn=A&curPage=1">2026년 빈집 정비 지원사업 신청 안내</a></td>
<td>주택건축국 건축정책과</td><td> 2026.10.20</td><td>5</td></tr>
<tr><td>2026-2</td><td class="title"><a href="/nbgosi/view?sno=102&gosiGbn=A&curPage=1">빈집 철거명령 공시송달 공고</a></td>
<td>건축과</td><td> 2026.10.19</td><td>3</td></tr>
</tbody></table>"""
VIEW_HTML = """<div class="boardView"><h4>2026년 빈집 정비 지원사업 신청 안내</h4>
<p>신청기간: 2026-10-20 ~ 2026-11-30</p><p>지원 금액: 철거비의 50%, 최대 1,500만원</p>
<ul class="attfiles"><li><a href="/nbgosi/download?fileId=F1&seq=0" title="공고문.pdf">공고문.pdf</a></li></ul>
</div><div class="btnArea"></div>"""


def busan_transport(robots_status=401):
    def handler(req: httpx.Request):
        p = req.url.path
        if p == "/robots.txt":
            return httpx.Response(robots_status, text="")
        if p == "/nbgosi/list":
            return httpx.Response(200, text=LIST_HTML)
        if p == "/nbgosi/view":
            return httpx.Response(200, text=VIEW_HTML)
        if p == "/nbgosi/download":
            return httpx.Response(404)
        return httpx.Response(404)
    return httpx.Client(transport=httpx.MockTransport(handler), base_url=busan_gosi.BASE)


def test_robots_rfc9309():
    assert programs.robots_allows("https://x.test/a", busan_transport(401)) is True   # 4xx = 규칙 없음
    assert programs.robots_allows("https://x.test/a", busan_transport(503)) is False  # 5xx = 확인 불가
    deny = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text="User-agent: *\nDisallow: /")))
    assert programs.robots_allows("https://x.test/a", deny) is False


def test_busan_crawl_filters_and_builds_text():
    notices = busan_gosi.crawl(programs.extract_text, busan_transport(), sleep=lambda s: None)
    assert [n["noticeKey"] for n in notices] == ["busan-gosi:101"]  # 공시송달 제외
    n = notices[0]
    assert n["postedAt"] == "2026-10-20"
    assert "사업명: 2026년 빈집 정비 지원사업 신청 안내" in n["text"] and "최대 1,500만원" in n["text"]
    assert "내려받기 실패" in n["text"]


def gov_client(status=200):
    rows = [
        {"서비스ID": "S1", "서비스명": "빈집 철거 지원", "소관기관명": "부산광역시 영도구", "부서명": "건축과",
         "지원내용": "철거비 최대 1,000만원", "전화문의": "051-000-0000", "수정일시": "20261001"},
        {"서비스ID": "S2", "서비스명": "청년 월세 지원", "소관기관명": "부산광역시", "지원내용": "월 20만원"},
    ]
    return httpx.Client(transport=httpx.MockTransport(
        lambda r: httpx.Response(status, json={"totalCount": 2, "data": rows} if status == 200 else {"code": -4})))


def test_gov24_filters_and_formats(monkeypatch):
    monkeypatch.setattr(settings, "data_go_kr_key", "k")
    items = gov24.fetch(gov_client())
    assert [i["서비스ID"] for i in items] == ["S1"]
    key, url, text, _ = gov24.to_notice(items[0])
    assert key == "gov24:S1" and "사업명: 빈집 철거 지원" in text and "기관: 부산광역시 영도구 건축과" in text


def test_collect_builtin_ingests_and_reports(monkeypatch):
    monkeypatch.setattr(settings, "data_go_kr_key", "k")
    monkeypatch.setattr(settings, "gov24_enabled", True)
    monkeypatch.setattr(settings, "busan_gosi_crawl", True)
    out = {"fetched": 0, "unchanged": 0, "skipped": [], "failed": []}
    jobs.collect_builtin(out, gov_client(401), busan_transport(), sleep=lambda s: None)
    assert out["fetched"] == 1 and any("활용신청" in s for s in out["skipped"])  # 정부24 미승인이어도 부산시는 수집
    with dbm.connect() as c:
        row = c.execute("SELECT k.status FROM program_candidates k JOIN programs p ON p.id = k.program_id "
                        "WHERE p.notice_key = 'busan-gosi:101'").fetchone()
    assert row["status"] == "pending"  # 자동 발행하지 않고 검토 대기
    out2 = {"fetched": 0, "unchanged": 0, "skipped": [], "failed": []}
    jobs.collect_builtin(out2, gov_client(), busan_transport(), sleep=lambda s: None)
    assert out2["unchanged"] == 1 and out2["fetched"] == 1  # 같은 원문은 다시 처리 안 함, 정부24 1건 추가
