"""카카오 로컬 API(공식): 등록 중개사무소의 전화번호·위치를 찾고, 집 주소의 좌표를 구한다.

developers.kakao.com 내 애플리케이션에서 '카카오맵(지도·로컬)' 서비스를 켜야 동작한다. 평점은 제공되지 않는다.
"""

from __future__ import annotations

import math
import re

import httpx

from ..settings import settings

KEYWORD = "https://dapi.kakao.com/v2/local/search/keyword.json"
ADDRESS = "https://dapi.kakao.com/v2/local/search/address.json"


class KakaoLocalError(Exception):
    pass


def configured() -> bool:
    return bool(settings.kakao_rest_api_key)


def _headers():
    return {"Authorization": f"KakaoAK {settings.kakao_rest_api_key}"}


async def _get(client: httpx.AsyncClient, url: str, params: dict) -> dict:
    r = await client.get(url, params=params, headers=_headers(), timeout=10)
    if r.status_code in (401, 403):
        msg = (r.json() or {}).get("message", "") if r.headers.get("content-type", "").startswith("application/json") else ""
        if "OPEN_MAP_AND_LOCAL" in msg:
            raise KakaoLocalError("카카오 앱에서 '카카오맵' 서비스를 켜야 해요(내 애플리케이션 → 제품 설정 → 카카오맵 → 활성화).")
        raise KakaoLocalError("카카오 로컬 API 인증 실패")
    r.raise_for_status()
    return r.json()


def _norm(s: str | None) -> str:
    return re.sub(r"[\s()]", "", (s or "")).replace("부산광역시", "")


async def geocode(client: httpx.AsyncClient, address: str) -> tuple[float, float] | None:
    d = await _get(client, ADDRESS, {"query": address, "size": 1})
    docs = d.get("documents") or []
    return (float(docs[0]["x"]), float(docs[0]["y"])) if docs else None


async def find_office(client: httpx.AsyncClient, name: str, sgg: str, road: str | None, jibun: str | None) -> dict | None:
    """'사무소 이름 + 구'로 찾고, 등록 주소(도로명·지번)가 맞는 결과를 고른다. 맞는 게 없으면 주소로 다시 찾는다."""
    for query in (f"{name} {sgg}".strip(), road or jibun or ""):
        if not query:
            continue
        d = await _get(client, KEYWORD, {"query": query, "size": 5})
        for doc in d.get("documents") or []:
            same_addr = (road and _norm(doc.get("road_address_name")) and _norm(doc["road_address_name"]) in _norm(road)) or \
                        (jibun and _norm(doc.get("address_name")) and _norm(doc["address_name"]) in _norm(jibun))
            if same_addr and ("부동산" in (doc.get("category_name") or "") or "중개" in (doc.get("place_name") or "")):
                return {"phone": doc.get("phone") or None, "placeUrl": doc.get("place_url"), "placeName": doc.get("place_name"),
                        "x": float(doc["x"]), "y": float(doc["y"])}
    return None


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """두 좌표(경도, 위도) 사이 거리(m)."""
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6_371_000 * 2 * math.asin(math.sqrt(h))
