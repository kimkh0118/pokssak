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


# ---- 오탐·상세 주소·robots 와일드카드·PDF OCR 조건
from app.adapters import discovery


def test_keyword_filter_rejects_noise():
    assert not discovery.is_program("도시재생사업소개", "도시재생 뉴딜 사업 소개")
    assert not discovery.is_program("관내 석면해체·제거 작업장 현황", "석면 해체 작업장 목록")
    assert not discovery.is_program("2026년 제5차 폐가철거정비사업 철거공사 견적제출", "폐가 철거 공사 견적 접수")
    assert not discovery.is_program("빈집 정비 조례 일부개정조례안 입법예고", "빈집 정비 지원 조항 개정")
    assert not discovery.is_program("빈집 현황", "관내 빈집 3,000호")  # 지원·모집 표현 없음
    assert discovery.is_program("2026년 빈집 정비 지원사업 신청 안내", "빈집 철거비 최대 1,500만원 지원, 신청 접수")


def test_busan_detail_url_keeps_gosi_type():
    rows = busan_gosi.parse_list('<td class="title"><a href="/nbgosi/view?sno=78203&gosiGbn=P&curPage=1">빈집 지원</a></td>'
                                 '<td>건축과</td><td> 2026.06.02</td>')
    assert rows[0]["gosiGbn"] == "P"
    notices = busan_gosi.crawl(programs.extract_text, busan_transport(), sleep=lambda s: None)
    assert notices[0]["url"].endswith("sno=101&gosiGbn=A")


def test_robots_wildcards():
    r = programs.Robots("User-agent: *\nDisallow: /*bbs*\nDisallow: /*.pdf$\nAllow: /bbs/public/\n")
    assert not r.can_fetch("https://x.test/kr/bbs/list.do")
    assert not r.can_fetch("https://x.test/a/file.pdf")
    assert r.can_fetch("https://x.test/a/file.pdf?x=1")
    assert r.can_fetch("https://x.test/bbs/public/1")  # 더 긴 Allow 가 우선
    assert r.can_fetch("https://x.test/news")
    own = programs.Robots("User-agent: *\nDisallow: /\n\nUser-agent: BusanVacantHouseBot\nDisallow: /private\n")
    assert own.can_fetch("https://x.test/news") and not own.can_fetch("https://x.test/private/a")


def test_pdf_ocr_only_for_scanned():
    assert not programs.needs_ocr(["본문 글자가 충분히 들어 있는 첫 페이지입니다", "둘째 페이지도 글자가 충분히 있어요 정말로요", ""])
    assert programs.needs_ocr(["", "", "짧음"])
    assert not programs.needs_ocr([])


def test_regeneration_pages_are_not_programs():
    assert not discovery.is_program("주거환경 정비사업", "집수리 지원 등을 통한 노후불량 거주환경 개선, 주민 신청")
    assert not discovery.is_program("주례동 도시재생활성화계획 고시", "빈집 및 빈점포를 소공원으로 조성, 사업지원")


def test_broad_keywords_still_filter_noise():
    assert not discovery.is_program("2026년 노후주택 집수리 지원사업 모집", "집수리 지원 신청, 최대 500만원")  # 철거 아님
    assert discovery.is_program("주거취약계층 지원 안내", "빈집 철거비 지원 신청, 빈집 소유자 대상, 최대 1,000만원 지원, 신청방법: 방문 접수")  # 본문 2회
    assert not discovery.is_program("망미동 주민공모사업 모집", "간단 집수리 지원 등 마을 사업 신청")  # 본문 1회 언급
    assert not discovery.is_program("슬레이트 처리 지원사업 선정결과 공고", "슬레이트 지원 선정")


def test_region_from_agency():
    assert programs.region_from_agency("사업명: x\n기관: 부산광역시 남구 건축과\n관할: 부산광역시 남구\n")["value"] == ["남구"]
    assert programs.region_from_agency("관할: 부산광역시\n")["value"] == ["부산광역시 전체"]
    assert programs.region_from_agency("관할: 부산광역시 기장군\n")["value"] == ["기장군"]


def test_district_program_only_matches_that_district():
    prog = {"status": "접수중", "reviewState": "published", "data": {"regionSggs": {"value": ["남구"]}}}
    assert programs.match(prog, {"sggName": "해운대구"})["result"] == "mismatch"   # 다른 구 소유자에게 알림 안 감
    assert programs.match(prog, {"sggName": "남구"})["result"] != "mismatch"


def test_search_and_list_pages_are_not_candidates():
    assert discovery.is_listing("https://www.bsseogu.go.kr/board/list.bsseogu?boardId=B&keyword=%EC%8A%AC", "공지사항")
    assert discovery.is_listing("https://www.busan.go.kr/search/front/Search.jsp?query=빈집", "검색 빈집")
    assert not discovery.is_listing("https://www.haeundae.go.kr/board/view.do?boardId=B&dataSid=1", "빈집 정비 지원 안내")


def test_free_text_amount_period_summary():
    t = ("사업명: 2026년 빈집 정비 지원사업\n기관: 부산광역시 남구 건축과\n관할: 부산광역시 남구\n"
         "□ 신청기간 : 2026. 3. 2.(월) ~ 2026. 4. 30.(목) 18:00\n□ 지원내용: 빈집 철거비 지원, 동당 최대 1,400만 원 이내\n")
    d, errors = programs.validate_evidence(programs.structure_sample(t), t)
    assert not errors
    assert d["benefitCap"]["value"] == 14_000_000
    assert (d["applyStart"]["value"], d["applyEnd"]["value"]) == ("2026-03-02", "2026-04-30")
    assert "철거비" in d["summary"]["value"]


# ---- 부실한 후보 개선: 제목·중복·보도자료·필드
def test_best_title_prefers_page_heading():
    page = discovery.Page('<html><head><title>부산광역시</title></head><body><main><h3 class="view_tit">'
                          '생활 SOC 조성 사업 및 빈집 플러스드림사업 2개 구 선정</h3><p>본문</p></main></body></html>')
    assert discovery.best_title("... SOC) 조성 사업 및 빈집 플러스드림사업 2개 구 선정 ...", page) == "생활 SOC 조성 사업 및 빈집 플러스드림사업 2개 구 선정"


def test_same_article_under_different_menus_has_one_key():
    keys = {discovery.article_key(u) for u in ("https://www.busan.go.kr/globalhubcity/news/1736690",
                                               "https://www.busan.go.kr/bsi/news/1736690", "https://www.busan.go.kr/nbtnewsBU/1736690")}
    assert len(keys) == 1
    a = discovery.article_key("https://www.haeundae.go.kr/board/view.do?boardId=B1&dataSid=9&menuCd=X&startPage=1")
    b = discovery.article_key("https://www.haeundae.go.kr/board/view.do?boardId=B1&dataSid=9&menuCd=Y&startPage=3")
    assert a == b


def test_news_articles_need_more_program_signals():
    news = "지방시대특위는 빈집 활용 재생 사업의 성공사례를 둘러보며 빈집 문제에 대한 정책적 지원 방안을 논의했다."
    assert not discovery.is_program("지방시대특위, 빈집 활용 방안·지방소멸 해법 모색", news)
    notice = ("빈집 철거 지원사업 신청 안내\n지원대상: 1년 이상 비어 있는 빈집 소유자\n지원금액: 동당 최대 1,400만 원\n"
              "신청방법: 구청 건축과 방문 접수\n문의: 건축과 051-607-4321")
    assert discovery.is_program("2026년 빈집 철거 지원사업 신청 안내", notice)


def test_budget_until_exhausted_is_always_open_not_closed():
    t = ("사업명: 슬레이트 철거지원사업\n관할: 부산광역시 서구\n신청기간: 연중(예산 소진 시까지)\n"
         "지원대상: 슬레이트 지붕 주택 소유자\n지원금액: 최대 700만원\n문의: 환경위생과 051-240-4321\n")
    d, _ = programs.validate_evidence(programs.structure_sample(t), t)
    assert d["statusOverride"]["value"] is None
    assert d["applyAlways"]["value"] is True and programs.program_status(d) == "상시 접수"
    assert "051-240-4321" in d["contact"]["value"] and "슬레이트" in d["eligibility"]["value"]


def test_vacant_house_bank_is_not_support():
    assert not discovery.is_program("빈집뱅크란", "빈집 소유자와 수요자를 연결, 매물 등록 신청, 문의 051-600-4000")


def test_only_individual_demolition_programs():
    rural = ("농어촌 취약지역 생활여건 개조 지원", "노후주택정비 지원\n지원 대상: 최소 30가구 이상이며 슬레이트지붕 주택 비율이 40% 이상인 마을\n지원 금액 15억원")
    assert not discovery.is_program(*rural)
    remodel = ("2026년 햇살둥지 빈집 리모델링 지원 모집", "빈집 리모델링 공사비 최대 2,900만원 지원, 신청방법: 방문 접수")
    assert not discovery.is_program(*remodel)  # 철거가 아님
    old = ("[개금2동] 2023년 슬레이트 철거 및 지붕개량 지원사업 안내", "슬레이트 철거 지원 최대 700만원, 신청기간 확인")
    assert not discovery.is_program(*old)  # 지난 연도
    ok = ("2026년 빈집 철거 지원사업 모집", "빈집 철거비 최대 1,400만원 지원, 신청방법: 구청 방문")
    assert discovery.is_program(*ok)


def test_old_year_title_is_closed():
    data = {"title": {"value": "2023년 슬레이트 철거 지원사업"}}
    assert programs.program_status(data) == "마감"
