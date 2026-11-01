"""Render 무료 서버 잠 깨우기: 15분 동안 접속이 없으면 잠들므로, 10분마다 자기 공개 주소를 한 번 연다.

Render가 넣어 주는 RENDER_EXTERNAL_URL 이 있을 때만 동작(로컬·테스트에서는 꺼짐).
공개 주소로 들어오는 요청이라 Render가 접속으로 센다. 무료 750시간/월이면 서버 1개를 한 달 내내 켤 수 있다.
"""

from __future__ import annotations

import logging
import os
import threading
import time

import httpx

INTERVAL_SECONDS = 10 * 60
log = logging.getLogger(__name__)


def _loop(url: str):
    while True:
        time.sleep(INTERVAL_SECONDS)
        try:
            httpx.get(f"{url}/api/status", timeout=30)
        except Exception as e:  # 한 번 실패해도 다음 차례에 다시 시도
            log.warning("keepalive 실패: %s", e)


def start():
    url = (os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")
    if url:
        threading.Thread(target=_loop, args=(url,), daemon=True, name="keepalive").start()
