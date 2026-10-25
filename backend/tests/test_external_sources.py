"""카카오 검색 단서·복지로 지자체 복지서비스(가짜 응답, 실제 접속 없음)."""

import httpx
import pytest

from app import db as dbm, jobs
from app.adapters import bokjiro, kakao
from app.settings import settings


@pytest.fixture
def kakao_key(monkeypatch):
    monkeypatch.setattr(settings, "kakao_rest_api_key", "rest-key")
    monkeypatch.setattr(settings, "kakao_pages", 1)


def kakao_client(seen=None):
    docs = [
        {"title": "<b>남구</b>, 빈집 철거비 최대 1,400만원 지원 신청 받아", "url": "https://news.test/1",
         "contents": "부산 남구가 빈집 소유자를 대상으로 철거 지원 신청을 받는다", "datetime": "2026-10-12T09:00:00.000+09:00"},
        {"title": "해운대구 빈집정비지원사업 안내", "url": "https://www.haeundae.go.kr/board/view.do?boardId=B&dataSid=77",
         "contents": "빈집 철거·리모델링 지원 신청"},
        {"title": "서울 강남구 빈집 지원", "url": "https://news.test/2", "contents": "서울 지원 신청"},  # 부산 아님
        {"title": "부산 폐가전 무상 수거 신청", "url": "https://news.test/3", "contents": "폐가전 지원 신청"},  # 폐가전
    ]

    def handler(r):
        if seen is not None:
            seen.append(r.headers.get("Authorization"))
        return httpx.Response(200, json={"documents": docs, "meta": {"is_end": True}})
    return httpx.Client(transport=httpx.MockTransport(handler), headers={"Authorization": "KakaoAK rest-key"})


def test_kakao_filters_busan_vacant_support(kakao_key):
    leads = kakao.search(kakao_client(), sleep=lambda s: None)
    links = {l["link"]: l for l in leads}
    assert set(links) == {"https://news.test/1", "https://www.haeundae.go.kr/board/view.do?boardId=B&dataSid=77"}
    assert links["https://news.test/1"]["region"] == "남구" and links["https://news.test/1"]["publishedAt"] == "2026-10-12"
    assert links["https://news.test/1"]["source"] == "kakao_web"
    assert links["https://www.haeundae.go.kr/board/view.do?boardId=B&dataSid=77"]["official"]


def test_kakao_sends_rest_key(kakao_key):
    seen = []
    kakao.search(kakao_client(seen), sleep=lambda s: None)
    assert seen and all(h == "KakaoAK rest-key" for h in seen)


def test_kakao_leads_saved_and_official_queued(kakao_key):
    out = {"fetched": 0, "unchanged": 0, "skipped": [], "failed": []}
    jobs.collect_search(out, kakao_client(), sleep=lambda s: None)
    assert out["search"]["newLeads"] == 2 and out["search"]["officialQueued"] == 1
    with dbm.connect() as c:
        assert c.execute("SELECT priority FROM discovery_frontier WHERE url LIKE '%dataSid=77%'").fetchone()[0] == 200
    jobs.collect_search(out, kakao_client(), sleep=lambda s: None)
    assert out["search"]["newLeads"] == 0  # 같은 글은 다시 저장 안 함


def test_kakao_without_key_is_skipped():
    out = {"fetched": 0, "unchanged": 0, "skipped": [], "failed": []}
    jobs.collect_search(out)
    assert any("카카오" in s for s in out["skipped"])


def test_kakao_bad_key(kakao_key):
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401, json={"errorType": "AccessDeniedError"})))
    with pytest.raises(kakao.KakaoError, match="인증"):
        kakao.search(client, sleep=lambda s: None)


BOKJIRO_XML = """<?xml version="1.0" encoding="UTF-8"?><wantedList><totalCount>2</totalCount>
<servList><servId>WLF1</servId><servNm>빈집 정비 지원</servNm><bizChrDeptNm>부산광역시 영도구 건축과</bizChrDeptNm>
<sggNm>영도구</sggNm><servDgst>빈집 철거비 최대 1,000만원 지원</servDgst><aplyMtdNm>방문</aplyMtdNm><inqNum>051-419-4000</inqNum></servList>
<servList><servId>WLF2</servId><servNm>출산 축하금</servNm><sggNm>영도구</sggNm><servDgst>출산 가정 지원</servDgst></servList>
</wantedList>"""


def test_bokjiro_filters_and_formats(monkeypatch):
    monkeypatch.setattr(settings, "data_go_kr_key", "k")
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=BOKJIRO_XML)))
    items = bokjiro.fetch(client, sleep=lambda s: None)
    assert [i["servId"] for i in items] == ["WLF1"]
    key, url, text, _ = bokjiro.to_notice(items[0])
    assert key == "bokjiro:WLF1" and "관할: 부산광역시 영도구" in text and "최대 1,000만원" in text


def test_bokjiro_unregistered_key(monkeypatch):
    monkeypatch.setattr(settings, "data_go_kr_key", "k")
    err = "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>"
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(403, text=err)))
    with pytest.raises(bokjiro.BokjiroError, match="활용신청"):
        bokjiro.fetch(client, sleep=lambda s: None)


def test_kakao_quota_keeps_partial_and_alerts_admin(kakao_key):
    from app import auth
    from app import notify
    auth.signup("admin@example.com", "password123")  # ADMIN_EMAILS(테스트)에 있는 계정
    calls = {"n": 0}

    def handler(r):
        calls["n"] += 1
        if calls["n"] > 1:  # 두 번째 요청부터 한도 초과
            return httpx.Response(429, json={"errorType": "RequestThrottled"})
        return httpx.Response(200, json={"documents": [{"title": "남구 빈집 철거 지원 신청", "url": "https://news.test/q",
                                                        "contents": "부산 남구 빈집 철거비 지원 신청"}], "meta": {"is_end": True}})
    out = {"fetched": 0, "unchanged": 0, "skipped": [], "failed": []}
    jobs.collect_search(out, httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)
    assert out["search"]["quotaExceeded"] and out["search"]["newLeads"] == 1  # 한도 전 결과는 저장
    assert any("한도 초과" in s for s in out["skipped"])
    with dbm.connect() as c:
        uid = c.execute("SELECT id FROM users WHERE email = 'admin@example.com'").fetchone()[0]
    inbox = notify.inbox(uid)
    assert inbox and inbox[0]["event"] == "admin_alert" and "한도" in inbox[0]["body"]
    assert jobs.coverage()["searchQuota"]["found"] == 1
    jobs.collect_search(out, httpx.Client(transport=httpx.MockTransport(handler)), sleep=lambda s: None)
    assert len(notify.inbox(uid)) == 1  # 같은 날 알림은 한 번만
