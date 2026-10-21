"""어댑터 공통: HTTP 호출, 일시 오류 재시도, 공공데이터포털 응답 해석, 키 가림."""

from __future__ import annotations

import asyncio
import json
import logging
import xml.etree.ElementTree as ET

import httpx

from ..clock import now_iso
from ..settings import settings

log = logging.getLogger("adapters")
RETRY_KINDS = ("network", "upstream")
RETRY_DELAYS = (1.0, 2.5)


def hide_keys(message: str) -> str:
    for key in (settings.juso_key, settings.data_go_kr_key, settings.vworld_key):
        if key:
            message = message.replace(key, "***")
    return message


def fail(kind: str, source: str, message: str, code: str | None = None) -> dict:
    """kind: not_configured | auth | rate_limit | no_result | invalid_request | upstream | network | parse"""
    return {"ok": False, "error": {"kind": kind, "source": source, "message": hide_keys(message), "code": code}}


def ok(data, source: str, provenance: str = "public_api", **meta) -> dict:
    return {"ok": True, "data": data, "meta": {"source": source, "provenance": provenance, "fetchedAt": now_iso(), **meta}}


async def get(client: httpx.AsyncClient, url: str, params: dict, source: str, headers: dict | None = None):
    """(HTTP 상태, 본문) 또는 (None, 실패 결과)."""
    try:
        r = await client.get(url, params=params, headers=headers, timeout=settings.timeout_seconds)
        return r.status_code, r.text
    except httpx.TimeoutException:
        return None, fail("network", source, "응답 시간이 초과되었습니다.")
    except httpx.HTTPError as e:
        log.warning("%s 호출 실패: %s", source, hide_keys(str(e)))
        return None, fail("network", source, "네트워크 오류로 조회하지 못했습니다.")


def retry_transient(fn):
    """기관 서버 일시 장애(연결 실패·코드 04/05)는 잠깐 뒤 다시 시도한다. 인증 오류 등은 재시도하지 않는다."""
    async def wrapper(*args, **kwargs):
        result = await fn(*args, **kwargs)
        for delay in RETRY_DELAYS:
            if result.get("ok") or result.get("error", {}).get("kind") not in RETRY_KINDS:
                break
            await asyncio.sleep(delay)
            result = await fn(*args, **kwargs)
        return result
    wrapper.__name__, wrapper.__doc__ = fn.__name__, fn.__doc__
    return wrapper


DATA_GO_KR_CODES = {
    "03": "no_result", "04": "upstream", "05": "upstream",
    "12": "auth", "20": "auth", "30": "auth", "31": "auth", "32": "auth",
    "22": "rate_limit", "10": "invalid_request", "11": "invalid_request",
}


def _xml_to_dict(el: ET.Element):
    children = list(el)
    if not children:
        return (el.text or "").strip()
    out: dict = {}
    for c in children:
        v = _xml_to_dict(c)
        if c.tag in out:
            out[c.tag] = out[c.tag] if isinstance(out[c.tag], list) else [out[c.tag]]
            out[c.tag].append(v)
        else:
            out[c.tag] = v
    return out


def parse_data_go_kr(body: str, status: int, source: str) -> dict:
    """공공데이터포털 공통 응답. 정상: {"ok": True, "items": [...], "totalCount": n}
    정상 resultCode '00'/'000', 게이트웨이 오류는 OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode."""
    body = body.strip()
    try:
        if body.startswith("<"):
            root = ET.fromstring(body)
            doc = {root.tag: _xml_to_dict(root)}
        else:
            doc = json.loads(body)
    except (ValueError, ET.ParseError):
        if status in (401, 403):
            return fail("auth", source, f"인증 오류(HTTP {status})")
        if status == 429:
            return fail("rate_limit", source, "호출 제한을 초과했습니다.")
        return fail("parse", source, f"응답을 해석하지 못했습니다(HTTP {status}).")
    gateway = (doc.get("OpenAPI_ServiceResponse") or {}).get("cmmMsgHeader")
    if gateway:
        code = str(gateway.get("returnReasonCode", ""))
        return fail(DATA_GO_KR_CODES.get(code, "upstream"), source,
                    gateway.get("returnAuthMsg") or gateway.get("errMsg") or "게이트웨이 오류", code)
    resp = doc.get("response")
    if not resp:
        return fail("auth" if status in (401, 403) else "parse", source, "예상한 응답 형식이 아닙니다.")
    header = resp.get("header") or {}
    code = str(header.get("resultCode", ""))
    if code not in ("00", "000"):
        kind = DATA_GO_KR_CODES.get(code.lstrip("0").zfill(2), "upstream")
        if kind == "no_result":
            return {"ok": True, "items": [], "totalCount": 0}
        return fail(kind, source, header.get("resultMsg") or "오류", code)
    b = resp.get("body") or {}
    items = b.get("items")
    item = items.get("item") if isinstance(items, dict) else None
    total = b.get("totalCount")
    return {"ok": True, "items": [] if item is None else (item if isinstance(item, list) else [item]),
            "totalCount": int(total) if str(total or "").isdigit() else None}
