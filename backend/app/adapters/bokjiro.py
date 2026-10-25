"""복지로 지자체 복지서비스 목록 API(한국사회보장정보원, 공공데이터포털).

부산광역시·구·군이 운영하는 복지서비스 중 빈집·주거환경·집수리·슬레이트 관련만 골라 공고 원문처럼 정리한다.
공공데이터포털 계정 키(DATA_GO_KR_SERVICE_KEY)를 쓰며 '지자체복지서비스' 활용신청이 필요하다.
"""

from __future__ import annotations

import time
import xml.etree.ElementTree as ET

import httpx

from ..settings import settings
from .discovery import KEYWORDS

URL = "https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist"
TERMS = ("빈집", "주거", "집수리", "주택", "슬레이트", "리모델링", "철거")
# 응답 필드 → 원문 항목 이름
LABELS = (("servNm", "사업명"), ("bizChrDeptNm", "기관"), ("servDgst", "지원 내용"), ("trgterIndvdlNmArray", "지원 대상"),
          ("aplyMtdNm", "신청 방법"), ("srvPvsnNm", "지원 형태"), ("sprtCycNm", "지원 주기"), ("inqNum", "문의"))


class BokjiroError(Exception):
    pass


def _items(xml: str) -> tuple[list[dict], int]:
    root = ET.fromstring(xml)
    err = root.findtext(".//returnAuthMsg") or root.findtext(".//errMsg")
    if err and "NORMAL" not in err.upper():
        if "REGISTERED" in err.upper() or "등록되지" in err:
            raise BokjiroError("인증키가 이 서비스에 등록되지 않음(공공데이터포털에서 '지자체복지서비스' 활용신청 필요)")
        raise BokjiroError(f"복지로 API 오류: {err}")
    rows = [{c.tag: (c.text or "").strip() for c in item} for item in root.iter("servList")]
    total = int(root.findtext(".//totalCount") or 0)
    return rows, total


def relevant(item: dict) -> bool:
    text = " ".join(item.get(k, "") for k in ("servNm", "servDgst", "intrsThemaNmArray"))
    from .discovery import demolition_related
    return any(k in text for k in KEYWORDS + ("주거환경", "주택수리", "주거개선")) and demolition_related(item.get("servNm", ""), "지원 " + text)


def fetch(client: httpx.Client | None = None, sleep=time.sleep) -> list[dict]:
    if not settings.data_go_kr_key:
        raise BokjiroError("공공데이터포털 인증키 미설정")
    own = client is None
    client = client or httpx.Client(timeout=20)
    found: dict[str, dict] = {}
    try:
        for term in TERMS:
            for page in range(1, 11):
                r = client.get(URL, params={"serviceKey": settings.data_go_kr_key, "pageNo": page, "numOfRows": 100,
                                            "ctpvNm": "부산광역시", "searchWrd": term})
                if r.status_code in (401, 403) and "REGISTERED" in r.text:
                    raise BokjiroError("인증키가 이 서비스에 등록되지 않음(공공데이터포털에서 '지자체복지서비스' 활용신청 필요)")
                r.raise_for_status()
                rows, total = _items(r.text)
                for it in rows:
                    if it.get("servId") and relevant(it):
                        found.setdefault(it["servId"], it)
                sleep(0.2)
                if page * 100 >= total or not rows:
                    break
        return list(found.values())
    finally:
        if own:
            client.close()


def to_notice(item: dict) -> tuple[str, str, str, str | None]:
    sgg = item.get("sggNm") or ""
    lines = [f"{label}: {item.get(k, '')}" for k, label in LABELS if item.get(k)]
    lines.insert(2, f"관할: 부산광역시{(' ' + sgg) if sgg and sgg != '부산광역시' else ''}")
    lines.append("출처: 복지로 지자체 복지서비스(한국사회보장정보원)")
    url = item.get("servDtlLink") or f"https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId={item.get('servId')}"
    posted = item.get("lastModYmd") or None
    if posted and len(posted) == 8:
        posted = f"{posted[:4]}-{posted[4:6]}-{posted[6:]}"
    return f"bokjiro:{item.get('servId')}", url, "\n".join(lines), posted
