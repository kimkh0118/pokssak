"""부산광역시 고시·공고 게시판(https://www.busan.go.kr/nbgosi) 크롤러.

- 제목 키워드 검색 결과만 읽고, 상세 페이지와 첨부(hwpx·pdf) 텍스트를 하나의 원문으로 합친다.
- 요청 사이 간격을 두고, 공시송달·입찰·계약처럼 지원사업이 아닌 공고는 건너뛴다.
- robots.txt 를 먼저 확인한다(programs.robots_allows).
"""

from __future__ import annotations

import html
import re
import time

import httpx

from ..settings import settings
from ..clock import now
from .discovery import EXCLUDE, KEYWORDS, SEARCH_TERMS, fetch, is_program
from urllib.parse import urlencode
from datetime import timedelta

BASE = "https://www.busan.go.kr"
LIST = f"{BASE}/nbgosi/list"
SKIP = EXCLUDE
UA = "BusanVacantHouseBot/1.0 (weekly support-program collection)"  # 헤더는 ASCII만 가능
DELAY_SECONDS = 1.0
MAX_ITEMS = 20

# 상세 주소에는 gosiGbn(고시·공고 구분)이 꼭 있어야 한다(없으면 Page Not Found)
ROW = re.compile(
    r'<a href="/nbgosi/view\?sno=(\d+)(?:&(?:amp;)?gosiGbn=(\w+))?[^"]*">([^<]+)</a></td>\s*<td[^>]*>([^<]*)</td>\s*<td[^>]*>\s*([\d.]+)')
ATTACH = re.compile(r'<a href="(/nbgosi/download\?fileId=[^"]+)" title="([^"]+)"')


def parse_list(page: str) -> list[dict]:
    out = []
    for sno, gbn, title, dept, day in ROW.findall(page):
        title = html.unescape(title).strip()
        out.append({"sno": sno, "gosiGbn": gbn or "A", "title": title, "dept": dept.strip(), "postedAt": day.strip().replace(".", "-").rstrip("-")})
    return out


def wanted(title: str) -> bool:
    return any(k in title for k in KEYWORDS) and not any(s in title for s in SKIP)


def body_text(page: str) -> str:
    """상세 페이지의 게시물 영역만 글자로."""
    m = re.search(r'<div class="boardView">(.*?)<div class="(?:boardBtn|btnArea)', page, re.S)
    chunk = m.group(1) if m else page
    chunk = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", chunk, flags=re.S)
    chunk = re.sub(r"<br\s*/?>|</(p|dd|dt|li|h\d|div|tr)>", "\n", chunk)
    text = html.unescape(re.sub(r"<[^>]+>", " ", chunk))
    return "\n".join(ln.strip() for ln in text.splitlines() if ln.strip())


def attachments(page: str) -> list[tuple[str, str]]:
    seen, out = set(), []
    for href, name in ATTACH.findall(page):
        if href not in seen and name.lower().endswith((".hwpx", ".hwp", ".pdf")):
            seen.add(href)
            out.append((BASE + html.unescape(href), name))
    return out


def crawl(extract_text, client: httpx.Client | None = None, sleep=time.sleep, report=None) -> list[dict]:
    """키워드별 첫 페이지 검색 → 대상 공고 상세·첨부 수집. extract_text(kind, raw) 는 programs.extract_text."""
    own = client is None
    client = client or httpx.Client(timeout=20, headers={"User-Agent": UA}, follow_redirects=True)
    from ..programs import robots_guard
    guard = robots_guard()
    def get(url):
        final, raw, ct, encoding = fetch(client, url, BASE, guard)
        return raw, raw.decode(encoding, errors="replace")
    try:
        items: dict[str, dict] = {}
        report = report if report is not None else {}
        report.update(pages=0, discovered=0, attachmentFailures=[], errors=[], limited=False)
        for kw in SEARCH_TERMS:
            signatures = set()
            for page in range(1, settings.busan_max_pages + 1):
                try:
                    _, page_text = get(LIST + "?" + urlencode({"conGosiGbn": "", "schKeyType": "A", "srchText": kw, "curPage": page}))
                except (httpx.HTTPError, ValueError) as e:
                    report["errors"].append({"url": LIST, "reason": f"{kw} / {page}페이지: {type(e).__name__}"})
                    break
                rows = parse_list(page_text)
                report["pages"] += 1
                signature = tuple(row["sno"] for row in rows)
                if not rows or signature in signatures:
                    break
                signatures.add(signature)
                old = []
                for row in rows:
                    older = bool(row["postedAt"] and row["postedAt"] < (now() - timedelta(days=365 * settings.program_lookback_years)).date().isoformat())
                    old.append(older)
                    if wanted(row["title"]) and not older:
                        items.setdefault(row["sno"], row)
                sleep(DELAY_SECONDS)
                if all(old) or len(items) >= settings.busan_max_items:
                    break
            else:
                report["limited"] = True
        report["discovered"] = len(items)
        if len(items) > settings.busan_max_items:
            report["limited"] = True
        out = []
        for row in list(items.values())[:settings.busan_max_items]:
            url = f"{BASE}/nbgosi/view?sno={row['sno']}&gosiGbn={row['gosiGbn']}"
            try:
                _, view_text = get(url)
            except (httpx.HTTPError, ValueError) as e:
                report["errors"].append({"url": url, "reason": type(e).__name__})
                continue
            parts = [f"사업명: {row['title']}", f"기관: 부산광역시 {row['dept']}", "관할: 부산광역시", body_text(view_text)]
            for href, name in attachments(view_text):
                sleep(DELAY_SECONDS)
                try:
                    attachment_raw, _ = get(href)
                    text, status, reason = extract_text(name.rsplit(".", 1)[-1].lower(), attachment_raw)
                    if status == "ok" and text:
                        parts.append(f"[첨부: {name}]\n{text}")
                    else:
                        report["attachmentFailures"].append({"url": href, "name": name, "reason": reason or status})
                        parts.append(f"[첨부 확인 필요: {name}] {reason or status}")
                except (httpx.HTTPError, ValueError):
                    parts.append(f"[첨부: {name}] 내려받기 실패")
                    report["attachmentFailures"].append({"url": href, "name": name, "reason": "내려받기 실패"})
            if not is_program(row["title"], "\n".join(parts[3:])):
                report.setdefault("skippedNotProgram", 0)
                report["skippedNotProgram"] += 1
                sleep(DELAY_SECONDS)
                continue
            out.append({"noticeKey": f"busan-gosi:{row['sno']}", "url": url, "text": "\n".join(parts), "postedAt": row["postedAt"]})
            sleep(DELAY_SECONDS)
        return out
    finally:
        if own:
            client.close()
