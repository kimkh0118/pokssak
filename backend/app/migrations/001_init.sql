-- 부산 빈집 의사결정 서비스 초기 스키마
-- 공공자료 캐시와 개인 입력을 분리하고, 사업은 원문·추출 후보·검토·발행 버전으로 나눈다.

-- ---------------------------------------------------------------- 회원
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,          -- 토큰 원문은 저장하지 않음
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- 공공자료 캐시(개인정보 없음)
CREATE TABLE public_lookups (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,                   -- live | sample
  pnu TEXT,
  payload TEXT NOT NULL,                -- 6개 API 조회 결과(JSON)
  created_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- 자산(건물·필지 범위)과 분석
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL UNIQUE,       -- PNU + 대상 건물 키
  pnu TEXT NOT NULL,
  building_key TEXT,
  road_addr TEXT,
  jibun_addr TEXT,
  sgg_name TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE analyses (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  lookup_id TEXT NOT NULL REFERENCES public_lookups(id),
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,  -- 로그인 사용자
  guest_token_hash TEXT,                                      -- 비회원 세션
  answers TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- 입력 근거(상담 가격·견적·비용·가정). 값마다 출처 종류와 기준일을 남긴다.
CREATE TABLE evidence_inputs (
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  field TEXT NOT NULL,                  -- H, L, D, M_H, C_H.tax ...
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (analysis_id, field)
);
CREATE TABLE watched_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  analysis_id TEXT REFERENCES analyses(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (user_id, asset_id)
);

-- ---------------------------------------------------------------- 지원사업
CREATE TABLE program_sources (
  id TEXT PRIMARY KEY,
  agency TEXT NOT NULL,
  region TEXT NOT NULL,
  list_url TEXT NOT NULL,
  auto_fetch_allowed INTEGER NOT NULL DEFAULT 0,  -- 이용 조건 확인 후에만 1
  terms_note TEXT,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE program_documents (           -- 원문과 변경 기록
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES program_sources(id),
  url TEXT NOT NULL,
  notice_key TEXT NOT NULL,                -- 공고 식별자
  posted_at TEXT,
  content_type TEXT NOT NULL,              -- html | pdf | hwp | hwpx | text
  content_hash TEXT NOT NULL,
  raw_text TEXT,
  extract_status TEXT NOT NULL,            -- ok | failed | unsupported
  extract_error TEXT,
  fetched_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  UNIQUE (notice_key, content_hash)
);
CREATE TABLE programs (
  id TEXT PRIMARY KEY,
  notice_key TEXT NOT NULL UNIQUE,
  current_version_id TEXT,
  review_state TEXT NOT NULL DEFAULT 'none',   -- none | changing(변경 확인 중)
  last_success_fetch_at TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE program_candidates (          -- LLM 추출 후보(검토 대기)
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  document_id TEXT NOT NULL REFERENCES program_documents(id),
  data TEXT NOT NULL,                      -- 구조화 결과 + 필드별 근거
  validation TEXT NOT NULL,                -- 근거 검증 결과
  parser_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  status TEXT NOT NULL,                    -- pending | approved | rejected
  important_changes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE program_versions (            -- 발행본(보존)
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id),
  version_no INTEGER NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES program_candidates(id),
  data TEXT NOT NULL,
  published_at TEXT NOT NULL,
  published_by TEXT,
  UNIQUE (program_id, version_no)
);
CREATE TABLE review_log (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  action TEXT NOT NULL,                    -- approve | reject | edit
  actor TEXT,
  note TEXT,
  at TEXT NOT NULL
);
CREATE TABLE program_matches (
  analysis_id TEXT NOT NULL,
  program_version_id TEXT NOT NULL,
  result TEXT NOT NULL,                    -- partial_match | needs_check | mismatch | closed
  detail TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  PRIMARY KEY (analysis_id, program_version_id)
);
CREATE TABLE demolition_plans (
  analysis_id TEXT PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
  steps TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ---------------------------------------------------------------- 알림
CREATE TABLE notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app INTEGER NOT NULL DEFAULT 1,
  email INTEGER NOT NULL DEFAULT 0,
  sms INTEGER NOT NULL DEFAULT 0,
  push INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE notifications (               -- 앱 내 알림함
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL UNIQUE,         -- 사용자·자산·사업·이벤트·버전
  asset_id TEXT,
  program_id TEXT,
  event TEXT NOT NULL,                     -- new_candidate | opened | changed | closed
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,                   -- in_app | email | sms | push
  status TEXT NOT NULL,                    -- pending | sent | failed | skipped
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  sent_at TEXT,
  UNIQUE (notification_id, channel)
);

-- ---------------------------------------------------------------- 작업 실행
CREATE TABLE job_locks (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE job_runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,                   -- schedule | manual
  status TEXT NOT NULL,                    -- running | succeeded | failed | skipped_locked
  started_at TEXT NOT NULL,
  finished_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  summary TEXT,
  error TEXT
);
CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
