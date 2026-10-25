import io
import struct
import sys
import types

import httpx

from app import db as dbm, jobs, programs
from app.adapters import discovery, busan_gosi, gov24
from app.documents import hwp_text
from app.settings import settings


def test_resume_finds_hidden_body_and_hwp_failure(monkeypatch):
    monkeypatch.setattr(settings, 'discovery_pages', 2)
    pages = {
        '/': '<a href="/board">고시공고</a>',
        '/board': '<a href="/view?seq=2">2026 주거환경 개선사업</a><a href="/board?page=2">2</a>',
        '/view': '<main>빈집 소유자에게 철거비 지원. 신청기간 확인 필요.<a href="/file.hwp">공고문.hwp</a></main>',
        '/file.hwp': 'broken',
    }
    client = httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(200,text=pages.get(r.url.path,''),headers={'content-type':'text/html'})))
    run = lambda: discovery.crawl_source('테스트구','https://example.go.kr/',programs.extract_text,lambda u,c:True,programs.ingest,client=client,sleep=lambda _:None)
    first = run()
    assert first['remaining'] and first['limited']
    second = run()
    assert second['fetched'] == 1
    assert second['attachmentFailures'] == 1
    assert second['errors'][0]['url'].endswith('.hwp')
    with dbm.connect() as c:
        assert c.execute("SELECT count(*) FROM program_candidates WHERE status='pending'").fetchone()[0] == 1
        assert c.execute('SELECT count(*) FROM program_versions').fetchone()[0] == 0


def test_scope_redirect_robots_and_download_limit():
    assert not discovery.allowed('https://evil.test/file','https://www.suyeong.go.kr/')
    client = httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(302,headers={'location':'https://evil.test/a'})))
    try:
        discovery.fetch(client,'https://www.suyeong.go.kr/a','https://www.suyeong.go.kr/',lambda u,c:True)
        assert False
    except ValueError:
        pass
    assert not discovery.allowed('https://www.suyeong.go.kr.evil.test/','https://www.suyeong.go.kr/')


def test_get_search_forms_and_body():
    p = discovery.Page('<nav>빈집 메뉴</nav><main>지원 대상: 노후주택</main><form action="/search" method="get"><input type="hidden" name="board" value="1"><input name="searchWrd"></form>')
    assert p.text == '지원 대상: 노후주택'
    assert p.forms[0]['query'] == 'searchWrd'
    assert discovery.relevant('햇살둥지 사업')
    assert busan_gosi.wanted('빈집 지원사업 평가 결과 안내')
    assert not busan_gosi.wanted('빈집 철거명령 공시송달')


def test_busan_second_page(monkeypatch):
    monkeypatch.setattr(settings, 'busan_max_pages', 4)
    from .test_collectors import LIST_HTML, VIEW_HTML
    def response(req):
        if req.url.path == '/robots.txt':
            return httpx.Response(404)
        if req.url.path.endswith('/list'):
            page = req.url.params.get('curPage')
            return httpx.Response(200,text=LIST_HTML if page=='1' else LIST_HTML.replace('101','103') if page=='2' else '')
        return httpx.Response(200,text=VIEW_HTML.replace('<ul','<ul')) if req.url.path.endswith('/view') else httpx.Response(404)
    report={}
    rows=busan_gosi.crawl(programs.extract_text,httpx.Client(transport=httpx.MockTransport(response)),sleep=lambda _:None,report=report)
    assert {r['noticeKey'] for r in rows} == {'busan-gosi:101','busan-gosi:103'}
    assert report['pages'] >= 3


def test_hwp_paragraph_extraction(monkeypatch):
    text='빈집 철거 지원 최대 1,000만원'.encode('utf-16le')
    data=struct.pack('<I',67 | len(text)<<20)+text
    class Ole:
        def __init__(self,*a): pass
        def __enter__(self): return self
        def __exit__(self,*a): pass
        def listdir(self): return [['BodyText','Section0']]
        def openstream(self,name):
            return io.BytesIO(bytes(256) if name=='FileHeader' else data)
    monkeypatch.setitem(sys.modules,'olefile',types.SimpleNamespace(OleFileIO=Ole))
    assert '최대 1,000만원' in hwp_text(b'fake')


def test_coverage_counts_do_not_mix_sample():
    programs.ingest('test','https://www.suyeong.go.kr/a','사업명: 빈집 지원'.encode(),'text/plain')
    result=jobs.coverage()
    assert result['counts']['collected'] == 1
    assert result['counts']['pending'] == 1
    assert result['counts']['published'] == 0
    assert len(result['configuredSources']) == 17


def test_literal_script_redirect_discovery():
    p=discovery.Page("<script>location.href = 'https://www.bsbukgu.go.kr/index.bsbukgu?contentsSid=1';</script>")
    assert p.links == [('https://www.bsbukgu.go.kr/index.bsbukgu?contentsSid=1','대표 홈페이지 진입')]



def test_failed_structure_retries_unchanged_document(monkeypatch):
    monkeypatch.setattr(settings, 'anthropic_api_key', 'test')
    monkeypatch.setattr(programs, 'structure_llm', lambda text: None)
    first=programs.ingest('retry','https://www.suyeong.go.kr/a','사업명: 빈집 지원'.encode(),'text/plain')
    assert first.get('error')
    monkeypatch.setattr(programs, 'structure_llm', programs.structure_sample)
    second=programs.ingest('retry','https://www.suyeong.go.kr/a','사업명: 빈집 지원'.encode(),'text/plain')
    assert second['pendingReview']
    with dbm.connect() as c:
        assert c.execute('SELECT count(*) FROM program_documents').fetchone()[0] == 1


def test_attachment_only_support_is_discovered(monkeypatch):
    monkeypatch.setattr(settings,'discovery_pages',3)
    def response(req):
        if req.url.path == '/':
            return httpx.Response(200,text='<a href="/board">공지사항</a>',headers={'content-type':'text/html'})
        if req.url.path == '/board':
            return httpx.Response(200,text='<a href="/view?seq=8">2026년 사업 신청 안내</a>',headers={'content-type':'text/html'})
        if req.url.path == '/view':
            return httpx.Response(200,text='<main>자세한 사항은 첨부 참고<a href="/grant.pdf">신청안내.pdf</a></main>',headers={'content-type':'text/html'})
        return httpx.Response(200,content=b'%PDF fake',headers={'content-type':'application/pdf'})
    result=discovery.crawl_source('테스트구','https://example.go.kr/',lambda kind,raw:('빈집 철거비 지원사업', 'ok', None),lambda u,c:True,programs.ingest,
                                  client=httpx.Client(transport=httpx.MockTransport(response)),sleep=lambda _:None)
    assert result['fetched'] == 1



def test_appliances_are_not_vacant_houses():
    assert not discovery.relevant('대형 폐가전 수거 지원')
    assert discovery.relevant('폐가 철거비 지원')
    assert not busan_gosi.wanted('폐가전 철거 지원사업')
    assert not gov24._matches({'서비스명':'폐가전 수거 지원'})
