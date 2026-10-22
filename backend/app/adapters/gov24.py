"""정부24 공공서비스(혜택) 정보 API(행정안전부, 공공데이터포털 15113968).

부산 기관이 운영하는 서비스 중 빈집·철거·노후주택 관련 항목만 골라 공고 원문처럼 정리한다.
공공데이터포털 계정 키(DATA_GO_KR_SERVICE_KEY)를 쓰며, 이 서비스에 별도 활용신청이 필요하다.
"""

from __future__ import annotations

import httpx

from ..settings import settings

URL = "https://api.odcloud.kr/api/gov24/v3/serviceList"
KEYWORDS = ("빈집", "빈 집", "폐가", "공가주택", "노후주택", "노후 주택", "슬레이트")
HOUSE_WORDS = ("주택", "건축물", "가옥")  # '철거'는 집과 함께 나올 때만(간판·시설물 철거 제외)
EXCLUDE = ("화재", "간판", "요금", "감면")  # 빈집 처리와 무관한 사업
PER_PAGE = 500
MAX_PAGES = 10


class Gov24Error(Exception):
    pass


def _matches(item: dict) -> bool:
    text = " ".join(str(item.get(k) or "") for k in ("서비스명", "서비스목적요약", "지원내용", "지원대상"))
    name = str(item.get("서비스명") or "")
    if any(x in name for x in EXCLUDE):
        return False
    if any(k in text for k in KEYWORDS):
        return True
    return "철거" in name and any(w in text for w in HOUSE_WORDS)


def fetch(client: httpx.Client | None = None) -> list[dict]:
    """부산 소관 서비스 전체를 받아 키워드로 거른다. 키가 없거나 활용신청 전이면 Gov24Error."""
    if not settings.data_go_kr_key:
        raise Gov24Error("공공데이터포털 인증키 미설정")
    own = client is None
    client = client or httpx.Client(timeout=30)
    try:
        found: list[dict] = []
        for page in range(1, MAX_PAGES + 1):
            r = client.get(URL, params={"page": page, "perPage": PER_PAGE, "serviceKey": settings.data_go_kr_key,
                                        "cond[소관기관명::LIKE]": "부산"})
            if r.status_code == 401:
                raise Gov24Error("인증키가 이 서비스에 등록되지 않음(공공데이터포털에서 '대한민국 공공서비스 정보' 활용신청 필요)")
            r.raise_for_status()
            body = r.json()
            rows = body.get("data") or []
            found += [x for x in rows if _matches(x)]
            if page * PER_PAGE >= int(body.get("totalCount") or 0) or not rows:
                break
        return found
    finally:
        if own:
            client.close()


def to_notice(item: dict) -> tuple[str, str, str, str | None]:
    """(공고 키, 원문 주소, 정리한 원문, 게시일). 원문은 구조화기가 읽는 '항목: 값' 형식."""
    agency = " ".join(x for x in (item.get("소관기관명"), item.get("부서명")) if x)
    lines = [
        f"사업명: {item.get('서비스명') or ''}",
        f"기관: {agency}",
        f"관할: {item.get('소관기관명') or ''}",
        f"지원 유형: {item.get('지원유형') or ''}",
        f"사업 목적: {item.get('서비스목적요약') or ''}",
        f"지원 대상: {item.get('지원대상') or ''}",
        f"선정 기준: {item.get('선정기준') or ''}",
        f"지원 내용: {item.get('지원내용') or ''}",
        f"신청 방법: {item.get('신청방법') or ''}",
        f"신청 기한: {item.get('신청기한') or ''}",
        f"접수 기관: {item.get('접수기관') or ''}",
        f"문의: {item.get('전화문의') or ''}",
        "출처: 정부24 공공서비스 정보(행정안전부)",
    ]
    url = item.get("상세조회URL") or f"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{item.get('서비스ID')}"
    posted = (item.get("수정일시") or item.get("등록일시") or "")[:10].replace(".", "-") or None
    return f"gov24:{item.get('서비스ID')}", url, "\n".join(lines), posted
