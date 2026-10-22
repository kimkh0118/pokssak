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

BASE = "https://www.busan.go.kr"
LIST = f"{BASE}/nbgosi/list"
KEYWORDS = ("빈집", "노후주택", "슬레이트", "철거 지원", "철거비")
SKIP = ("공시송달", "입찰", "계약", "평가", "행정대집행", "제안서", "열람공고", "결정고시", "인가")
UA = "BusanVacantHouseBot/1.0 (weekly support-program collection)"  # 헤더는 ASCII만 가능
DELAY_SECONDS = 1.0
MAX_ITEMS = 20

ROW = re.compile(
    r'<a href="/nbgosi/view\?sno=(\d+)[^"]*">([^<]+)</a></td>\s*<td[^>]*>([^<]*)</td>\s*<td[^>]*>\s*([\d.]+)')
ATTACH = re.compile(r'<a href="(/nbgosi/download\?fileId=[^"]+)" title="([^"]+)"')


def parse_list(page: str) -> list[dict]:
    out = []
    for sno, title, dept, day in ROW.findall(page):
        title = html.unescape(title).strip()
        out.append({"sno": sno, "title": title, "dept": dept.strip(), "postedAt": day.strip().replace(".", "-")})
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
        if href not in seen and name.lower().endswith((".hwpx", ".pdf")):
            seen.add(href)
            out.append((BASE + html.unescape(href), name))
    return out


def crawl(extract_text, client: httpx.Client | None = None, sleep=time.sleep) -> list[dict]:
    """키워드별 첫 페이지 검색 → 대상 공고 상세·첨부 수집. extract_text(kind, raw) 는 programs.extract_text."""
    own = client is None
    client = client or httpx.Client(timeout=20, headers={"User-Agent": UA}, follow_redirects=True)
    try:
        items: dict[str, dict] = {}
        for kw in KEYWORDS:
            r = client.get(LIST, params={"conGosiGbn": "", "schKeyType": "A", "srchText": kw})
            r.raise_for_status()
            for row in parse_list(r.text):
                if wanted(row["title"]):
                    items.setdefault(row["sno"], row)
            sleep(DELAY_SECONDS)
        out = []
        for row in list(items.values())[:MAX_ITEMS]:
            url = f"{BASE}/nbgosi/view?sno={row['sno']}"
            r = client.get(url)
            r.raise_for_status()
            parts = [f"사업명: {row['title']}", f"기관: 부산광역시 {row['dept']}", "관할: 부산광역시", body_text(r.text)]
            for href, name in attachments(r.text):
                sleep(DELAY_SECONDS)
                try:
                    a = client.get(href)
                    a.raise_for_status()
                    text, status, _ = extract_text("pdf" if name.lower().endswith(".pdf") else "hwpx", a.content)
                    if status == "ok" and text:
                        parts.append(f"[첨부: {name}]\n{text}")
                except httpx.HTTPError:
                    parts.append(f"[첨부: {name}] 내려받기 실패")
            out.append({"noticeKey": f"busan-gosi:{row['sno']}", "url": url, "text": "\n".join(parts), "postedAt": row["postedAt"]})
            sleep(DELAY_SECONDS)
        return out
    finally:
        if own:
            client.close()
