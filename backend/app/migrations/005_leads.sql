-- 외부 검색(카카오 웹문서·블로그·카페 등)에서 찾은 단서. 공식 공고가 아니므로 바로 발행하지 않고 관리자가 확인한다.
CREATE TABLE program_leads (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 source TEXT NOT NULL,            -- kakao_web | kakao_blog | kakao_cafe | manual
 query TEXT NOT NULL,
 title TEXT NOT NULL,
 link TEXT NOT NULL UNIQUE,
 description TEXT,
 region TEXT,                     -- 글에 나온 구·군(없으면 NULL)
 official INTEGER NOT NULL DEFAULT 0,  -- 공식 기관 주소(go.kr 등)면 1 → 다음 탐색에서 직접 읽음
 published_at TEXT,
 status TEXT NOT NULL DEFAULT 'new',   -- new | done | hidden
 found_at TEXT NOT NULL
);
CREATE INDEX program_leads_status ON program_leads(status, found_at);
