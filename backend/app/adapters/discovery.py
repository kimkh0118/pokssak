"""Official municipal discovery. Persisted frontier resumes bounded crawls across runs.
Only observed links and GET search forms are followed; JS-only boards are reported.
"""
from __future__ import annotations

import hashlib
import re
import time
from collections import deque
from datetime import timedelta
from html.parser import HTMLParser
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import httpx

from .. import db as dbm
from ..clock import now, now_iso
from ..settings import settings

# 부산시 공식 구·군 안내 https://www.busan.go.kr/eng/autonomous-districts
DISTRICTS = (
    ("중구", "bsjunggu"), ("서구", "bsseogu"), ("동구", "bsdonggu"), ("영도구", "yeongdo"),
    ("부산진구", "busanjin"), ("동래구", "dongnae"), ("남구", "bsnamgu"), ("북구", "bsbukgu"),
    ("해운대구", "haeundae"), ("사하구", "saha"), ("금정구", "geumjeong"), ("강서구", "bsgangseo"),
    ("연제구", "yeonje"), ("수영구", "suyeong"), ("사상구", "sasang"), ("기장군", "gijang"),
)
SOURCES = [("부산광역시", "https://www.busan.go.kr/")] + [(f"부산광역시 {n}", f"https://www.{d}.go.kr/") for n, d in DISTRICTS]
# 빈집 처리와 직접 관련된 표현만(도시재생·주거환경·해체·'철거' 단독은 오탐이 많아 제외)
# 주간 서버 수집이라 넓게 잡는다(사용자 검색 속도와 무관). 대신 후보는 '지원·모집 표현' + 제목/본문 반복 조건으로 거른다.
KEYWORDS = ("빈집", "빈 집", "공가", "폐가", "햇살둥지", "노후주택", "노후 주택", "노후불량주택", "슬레이트", "석면 슬레이트",
            "주택 철거", "철거 지원", "철거비", "집수리", "주택개량", "지붕개량", "리모델링", "주거환경개선", "주택정비")
# 검색칸·게시판 검색어
SEARCH_TERMS = ("빈집", "폐가", "공가", "햇살둥지", "슬레이트", "노후주택", "집수리", "주택개량", "철거 지원", "리모델링")
# 지원사업 공고라면 본문에 이런 말이 들어간다
SUPPORT_WORDS = ("지원", "보조", "모집", "신청", "접수")
NAV = ("고시", "공고", "새소식", "알림", "공지", "건축", "주택", "환경", "도시재생", "업무계획", "예산", "보도자료", "검색", "사이트맵", "전체메뉴", "대표", "누리집", "바로가기")
EXCLUDE = ("공시송달", "입찰", "계약", "견적", "채용", "철거명령", "행정대집행", "작업장 현황", "축제", "박람회",
           "조례", "입법예고", "결정고시", "인가", "열람공고", "폐가전", "가전제품", "결과 공고", "선정결과", "건강검진", "조사 결과", "석면관리", "석면관련")
UA = "BusanVacantHouseBot/2.0"
MAX_BYTES = 20 * 1024 * 1024


def relevant(text: str) -> bool:
    # 폐가전(used appliances) contains 폐가 but is unrelated to vacant houses.
    text = text.replace('폐가전', '').replace('가전제품', '')
    return any(k in text for k in KEYWORDS)


LISTING = re.compile(r"/list|[?&](?:keyword|query|srchText|searchWrd|searchKeyword|searchText|kwd|q)=|search", re.I)


def is_listing(url: str, title: str) -> bool:
    """검색 결과·게시판 목록 페이지(공고 하나가 아님). 링크는 따라가되 후보로는 만들지 않는다."""
    return title.startswith("검색 ") or bool(LISTING.search(urlsplit(url).path + "?" + urlsplit(url).query))


def is_program(title: str, text: str) -> bool:
    """지원사업 후보: 빈집 관련 표현 + 지원·모집 표현이 있고, 제목이 입찰·계약·조례 등이 아닐 것."""
    body = text.replace("폐가전", "").replace("가전제품", "")
    if any(x in title for x in EXCLUDE) or not any(w in body for w in SUPPORT_WORDS):
        return False
    # 제목에 단서가 있거나, 본문(첨부 포함)에 관련 표현이 2번 이상 나와야 한다(메뉴·사이드바 한 번 언급은 제외)
    return relevant(title) or sum(body.count(k) for k in KEYWORDS) >= 2


def canonical(url: str) -> str:
    p = urlsplit(url)
    pairs = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not k.lower().startswith(('utm_', 'jsessionid'))]
    return urlunsplit((p.scheme, p.netloc.lower(), p.path or '/', urlencode(sorted(pairs)), ''))


def allowed(url: str, root: str) -> bool:
    p, r = urlsplit(url), urlsplit(root)
    host = (r.hostname or '').removeprefix('www.')
    return p.scheme in ('https', 'http') and not p.username and not p.password and (p.port in (None, 80, 443)) and (p.hostname or '').removeprefix('www.') == host


class Page(HTMLParser):
    def __init__(self, text: str):
        super().__init__()
        self.links, self.forms, self.parts = [], [], []
        self.anchor, self.form, self.skip, self.main_depth = None, None, 0, 0
        self.main = []
        self.posted_at = None
        self.feed(text)
        # Follow literal redirect targets only, never execute remote JavaScript.
        for target in re.findall(r"(?:location(?:\.href)?|location\.replace)\s*(?:=|\()\s*['\"]([^'\"]+)['\"]", text):
            self.links.append((target, "대표 홈페이지 진입"))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style', 'nav', 'header', 'footer'):
            self.skip += 1
        if tag in ('main', 'article'):
            self.main_depth += 1
        if tag == 'meta' and a.get('property', '') in ('article:published_time', 'datePublished'):
            self.posted_at = a.get('content', '')[:10]
        if tag == 'meta' and a.get('http-equiv', '').lower() == 'refresh':
            match = re.search(r'url\s*=\s*(.+)', a.get('content', ''), re.I)
            if match:
                self.links.append((match.group(1).strip("\"' "), '대표 홈페이지 진입'))
        if tag == 'a':
            self.anchor = [a.get('href', ''), a.get('title', ''), []]
        if tag in ('iframe', 'frame') and a.get('src'):
            self.links.append((a['src'], '게시판 프레임'))
        if tag == 'form':
            self.form = {'action': a.get('action', ''), 'method': a.get('method', 'get').lower(), 'fields': {}, 'query': None}
        if tag == 'input' and self.form is not None:
            name, kind = a.get('name'), a.get('type', 'text')
            if name and kind == 'hidden':
                self.form['fields'][name] = a.get('value', '')
            if name and kind in ('text', 'search') and re.search(r'keyword|query|searchtext|srchtext|searchword|searchwrd|searchstr|searchtxt|sv', name, re.I):
                self.form['query'] = name

    def handle_endtag(self, tag):
        if tag == 'a' and self.anchor:
            href, title, parts = self.anchor
            self.links.append((href, (' '.join(parts) or title).strip()))
            self.anchor = None
        if tag == 'form' and self.form is not None:
            self.forms.append(self.form)
            self.form = None
        if tag in ('main', 'article'):
            self.main_depth = max(0, self.main_depth - 1)
        if tag in ('script', 'style', 'nav', 'header', 'footer'):
            self.skip = max(0, self.skip - 1)
        if tag in ('p', 'div', 'tr', 'li', 'br', 'h1', 'h2', 'h3'):
            self.parts.append('\n')
            if self.main_depth:
                self.main.append('\n')

    def handle_data(self, text):
        if self.anchor:
            self.anchor[2].append(text)
        if not self.skip:
            self.parts.append(text)
            if self.main_depth:
                self.main.append(text)

    @property
    def text(self):
        return '\n'.join(x.strip() for x in ''.join(self.main or self.parts).splitlines() if x.strip())


def fetch(client, url, root, robots):
    """Bounded download, per-URL robots and redirect scope checks."""
    for _ in range(6):
        if not allowed(url, root) or not robots(url, client):
            raise ValueError('접근 범위 또는 robots 제한')
        with client.stream('GET', url, follow_redirects=False) as r:
            if r.is_redirect:
                url = urljoin(url, r.headers['location'])
                continue
            r.raise_for_status()
            chunks, size = [], 0
            for chunk in r.iter_bytes():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise ValueError('문서 크기 제한 초과')
                chunks.append(chunk)
            raw = b''.join(chunks)
            return url, raw, r.headers.get('content-type', ''), r.encoding or 'utf-8'
    raise ValueError('리다이렉트 횟수 초과')


def crawl_source(agency, root, extract_text, robots, ingest, *, client=None, sleep=time.sleep, backfill=False):
    own = client is None
    client = client or httpx.Client(timeout=15, headers={'User-Agent': UA})
    report = dict(agency=agency, url=root, visited=0, discovered=0, relevant=0, fetched=0, unchanged=0,
                  attachmentFailures=0, blocked=0, javascriptLinks=0, remaining=0, errors=[])
    def error(url, reason):
        if len(report['errors']) < 30:
            report['errors'].append({'url': url, 'reason': reason})
    with dbm.connect() as c:
        rows = c.execute('SELECT url, depth, title FROM discovery_frontier WHERE source_url=? AND (last_visit IS NULL OR last_visit < ?) ORDER BY priority DESC, last_visit, url LIMIT 5000',
                         (root, (now() - timedelta(days=6)).isoformat())).fetchall()
    queue = deque([(r['url'], r['depth'], r['title']) for r in rows])
    queue.append((root, 0, agency))
    queued = {u for u, _, _ in queue}
    seen = set()
    limit = settings.discovery_backfill_pages if backfill else settings.discovery_pages
    deadline = time.monotonic() + (settings.discovery_backfill_seconds if backfill else settings.discovery_seconds)
    try:
        while queue and report['visited'] < limit and time.monotonic() < deadline:
            url, depth, title = queue.popleft()
            if url in seen:
                continue
            seen.add(url)
            report['visited'] += 1
            sleep(settings.discovery_delay)
            try:
                final, raw, content_type, encoding = fetch(client, url, root, robots)
                if 'html' not in content_type and b'<' not in raw[:100]:
                    continue
                page = Page(raw.decode(encoding, errors='replace'))
                # A date on the page is not necessarily the posting date. Preserve null.
                text = page.text
                posted = page.posted_at
                if not posted:
                    match = re.search(r'(?:등록일|작성일|게시일)\s*[:：]?\s*(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})', text)
                    if match:
                        y,m,d = map(int, match.groups())
                        posted = f'{y:04d}-{m:02d}-{d:02d}'
                historical = bool(posted and posted[:4].isdigit() and posted < (now() - timedelta(days=365 * settings.program_lookback_years)).date().isoformat())
                # 게시물 상세만(메뉴 번호 menuCd=DOM_0000… 는 상세가 아님)
                detail = bool(re.search(r'[?&](?:dataSid|boardSeq|seq|idx|nttId|sno|not_ancmt_mgt_no)=|/view', url, re.I))
                parts = [f'사업명: {title}', f'기관: {agency}', f'관할: {agency}', text]
                # Inspect attachments even when the title/body does not mention housing.
                # Generic announcements sometimes put all eligibility details in an HWP/PDF.
                if not historical and (detail or relevant(title)):
                    attachments_seen = set()
                    for href, label in page.links:
                        if time.monotonic() > deadline or len(attachments_seen) >= 10:
                            report['limited'] = True
                            break
                        if re.search(r'synap|viewer|preview', href, re.I):
                            continue
                        if not re.search(r'\.(hwp|hwpx|pdf)(?:\b|$)|download|fileDown', href + ' ' + label, re.I):
                            continue
                        attachment = urljoin(final, href)
                        if attachment in attachments_seen:
                            continue
                        attachments_seen.add(attachment)
                        try:
                            sleep(settings.discovery_delay)
                            _, data, ct, _ = fetch(client, attachment, root, robots)
                            from ..programs import detect_type
                            kind = detect_type(label, ct, data)
                            body, status, reason = extract_text(kind, data)
                            if status == 'ok':
                                parts.append(f'[첨부: {label}]\n{body}')
                            else:
                                report['attachmentFailures'] += 1
                                error(attachment, reason or status)
                                parts.append(f'[첨부 확인 필요: {label}] {reason}')
                        except Exception as e:
                            report['attachmentFailures'] += 1
                            error(attachment, type(e).__name__)
                candidate = not historical and not is_listing(final, title) and is_program(title, '\n'.join(parts[3:])) and (detail or relevant(title))
                if candidate:
                    report['relevant'] += 1
                    key = 'official:' + hashlib.sha256(canonical(final).encode()).hexdigest()[:24]
                    if (urlsplit(final).hostname or '').removeprefix('www.') == 'busan.go.kr' and '/nbgosi/view' in final:
                        sno = dict(parse_qsl(urlsplit(final).query)).get('sno')
                        if sno:
                            key = f'busan-gosi:{sno}'
                    result = ingest(key, final, '\n'.join(parts).encode(), 'text/plain', posted_at=posted)
                    if result.get('error'):
                        error(final, result['error'])
                    report['unchanged' if result.get('unchanged') else 'fetched'] += 1
                links = list(page.links)
                for form in page.forms:
                    if form['method'] == 'get' and form['query']:
                        for kw in SEARCH_TERMS:
                            target = urljoin(final, form['action'] or final)
                            p = urlsplit(target)
                            fields = dict(parse_qsl(p.query)) | form['fields'] | {form['query']: kw}
                            links.append((urlunsplit((p.scheme, p.netloc, p.path, urlencode(fields), '')), f'검색 {kw}'))
                for href, label in links:
                    if href.lower().startswith('javascript:'):
                        if any(k in label for k in NAV) or relevant(label):
                            report['javascriptLinks'] += 1
                        continue
                    target = canonical(urljoin(final, href))
                    if not href or href.startswith('#') or not allowed(target, root):
                        continue
                    if re.search(r'logout|delete|remove|\.zip(?:\?|$)|\.(?:png|jpg|gif|css|js)(?:\?|$)', target, re.I):
                        continue
                    nav = any(k in label for k in NAV)
                    topic = relevant(label)
                    pagination = bool(re.fullmatch(r'\d+|다음(?:페이지)?|이전(?:페이지)?|Next|[>»]+', label.strip(), re.I))
                    article = bool(re.search(r'dataSid=|boardSeq=|nttId=|sno=|seq=|idx=|/view', target, re.I))
                    if not (topic or nav or pagination or (article and depth >= 1 and depth <= 3)):
                        continue
                    # Related official links in relevant documents are followed for reverse tracing.
                    if (depth >= 6 and not pagination) or target in queued:
                        continue
                    next_depth = depth if pagination else depth + 1
                    priority = 100 if topic else 70 if nav else 40 if pagination else 10
                    with dbm.connect() as c:
                        existing = c.execute('SELECT last_visit FROM discovery_frontier WHERE source_url=? AND url=?', (root,target)).fetchone()
                        if existing and existing['last_visit'] and existing['last_visit'] >= (now() - timedelta(days=6)).isoformat():
                            continue
                        count = c.execute('SELECT count(*) FROM discovery_frontier WHERE source_url=?', (root,)).fetchone()[0]
                        if not existing and count >= settings.discovery_frontier_limit:
                            report['frontierLimited'] = True
                            continue
                        c.execute('INSERT OR IGNORE INTO discovery_frontier(source_url,url,depth,title,priority) VALUES (?,?,?,?,?)', (root,target,next_depth,label[:300],priority))
                    if topic:
                        queue.appendleft((target, next_depth, label))
                    else:
                        queue.append((target, next_depth, label))
                    queued.add(target)
                    report['discovered'] += 1
            except Exception as e:
                if isinstance(e, ValueError):
                    report['blocked'] += 1
                error(url, str(e) if isinstance(e, ValueError) else type(e).__name__)
            finally:
                with dbm.connect() as c:
                    c.execute('UPDATE discovery_frontier SET last_visit=? WHERE source_url=? AND url=?', (now_iso(),root,url))
        with dbm.connect() as c:
            report['remaining'] = c.execute('SELECT count(*) FROM discovery_frontier WHERE source_url=? AND last_visit IS NULL', (root,)).fetchone()[0]
        report['limited'] = report.get('limited', False) or bool(queue)
        report['status'] = 'partial' if report['errors'] or report['limited'] or report['javascriptLinks'] else 'succeeded'
        if report['discovered'] == 0 and report['relevant'] == 0:
            report['status'] = 'needs_check'
        return report
    finally:
        if own:
            client.close()
