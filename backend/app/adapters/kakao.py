"""카카오(다음) 검색 API(공식, developers.kakao.com)로 부산 빈집 지원사업 단서를 넓게 찾는다.

- 웹문서·블로그·카페를 '구·군 × 사업 표현' 조합으로 검색한다(REST API 키 1개, 일일 한도 안에서).
- 검색 결과 화면을 직접 긁지 않는다(이용약관). 반드시 API 키로 호출한다.
  (네이버 검색 API 는 2026-07-31 이후 신규 신청이 막혀 카카오로 대체)
- 공식 기관 주소(go.kr 등)는 다음 탐색에서 그 페이지를 직접 읽고, 나머지는 관리자 '단서' 목록으로 보낸다.
"""

from __future__ import annotations

import html
import re
import time
from urllib.parse import urlsplit

import httpx

from ..settings import settings
from .discovery import DEMOLITION, DISTRICTS, KEYWORDS, SUPPORT_WORDS

URL = "https://dapi.kakao.com/v2/search/{kind}"
KINDS = ("web", "blog", "cafe")
TERMS = ("빈집 철거 지원", "빈집 정비 지원사업", "빈집 리모델링 지원", "햇살둥지", "슬레이트 지붕 철거 지원",
         "노후주택 집수리 지원", "빈집 철거비", "폐가 철거 지원", "주택 개량 지원", "빈집 활용 지원")
OFFICIAL = re.compile(r"(?:^|\.)(?:go\.kr|busan\.kr|or\.kr)$")


class KakaoError(Exception):
    pass


class KakaoQuotaError(KakaoError):
    """일일 한도 초과. 그때까지 찾은 결과(partial)와 진행 위치를 함께 넘긴다."""

    def __init__(self, partial: list[dict], done_queries: int, total_queries: int):
        super().__init__(f"카카오 검색 API 일일 한도 초과({done_queries}/{total_queries}개 검색어까지 진행)")
        self.partial, self.done_queries, self.total_queries = partial, done_queries, total_queries


def configured() -> bool:
    return bool(settings.kakao_rest_api_key)


def queries() -> list[str]:
    qs = [f"부산 {t}" for t in TERMS]
    for name, _ in DISTRICTS:
        qs += [f"부산 {name} {t}" for t in TERMS[:6]]
    return qs


def _clean(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def region_of(text: str) -> str | None:
    """구·군 이름을 정확히(강남구의 '남구', 강서구의 '서구'를 잘못 잡지 않게 앞 글자가 한글이면 제외)."""
    return next((n for n, _ in DISTRICTS if re.search(rf"(?:(?<=부산)|(?<![가-힣])){n}", text)), None)


def relevant(title: str, desc: str) -> bool:
    text = f"{title} {desc}".replace("폐가전", "")
    return (("부산" in text or region_of(text) is not None) and any(k in text for k in KEYWORDS)
            and any(w in text for w in SUPPORT_WORDS) and bool(DEMOLITION.search(text)))


def search(client: httpx.Client | None = None, sleep=time.sleep, pages: int | None = None) -> list[dict]:
    """조합 검색 → 관련 결과(중복 제거). 키가 없거나 거부되면 KakaoError."""
    if not configured():
        raise KakaoError("카카오 검색 API 키 미설정(KAKAO_REST_API_KEY)")
    own = client is None
    client = client or httpx.Client(timeout=15, headers={"Authorization": f"KakaoAK {settings.kakao_rest_api_key}"})
    pages = pages or settings.kakao_pages
    found: dict[str, dict] = {}
    try:
        qs = queries()
        for qi, q in enumerate(qs):
            for kind in KINDS:
                for page in range(1, pages + 1):
                    r = client.get(URL.format(kind=kind), params={"query": q, "size": 50, "page": page, "sort": "accuracy"})
                    if r.status_code in (401, 403):
                        raise KakaoError("카카오 검색 API 인증 실패(REST API 키 확인)")
                    if r.status_code == 429 or (r.status_code == 400 and "limit" in r.text.lower()):
                        raise KakaoQuotaError(list(found.values()), qi, len(qs))
                    r.raise_for_status()
                    body = r.json()
                    for it in body.get("documents") or []:
                        title, desc = _clean(it.get("title")), _clean(it.get("contents"))
                        link = it.get("url") or ""
                        if not link or link in found or not relevant(title, desc):
                            continue
                        host = (urlsplit(link).hostname or "").lower()
                        found[link] = {"source": f"kakao_{kind}", "query": q, "title": title, "link": link, "description": desc,
                                       "region": region_of(f"{title} {desc}"), "official": bool(OFFICIAL.search(host)),
                                       "publishedAt": (it.get("datetime") or "")[:10] or None}
                    sleep(0.1)
                    if (body.get("meta") or {}).get("is_end", True):
                        break
        return list(found.values())
    finally:
        if own:
            client.close()
