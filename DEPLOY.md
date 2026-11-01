# 배포: 화면(Vercel) + 서버(Hugging Face Spaces) + 데이터(Turso) — 모두 무료

- **화면**: Vercel이 GitHub `kimkh0118/pokssak`의 `frontend`를 보고 자동 배포
- **서버**: Hugging Face Space(Docker)에 `backend` 폴더를 올림. 48시간 동안 아무도 안 쓰면 잠들고, 접속하면 깨어남
- **데이터**: Turso(원격 SQLite). 서버가 다시 켜져도 계정·관심 집·가격 기록이 남음
- 이후 수정은 루트의 **`저장하고배포.command`** 더블클릭 한 번(GitHub·Vercel·Hugging Face 모두)

## 1. 데이터 — Turso
1. https://turso.tech 에 GitHub로 가입 → **Create Database**(이름 예: `pokssak`, 지역은 Tokyo 등 가까운 곳)
2. 데이터베이스 화면에서
   - **URL** 복사(`libsql://pokssak-<아이디>.turso.io`) → `TURSO_DATABASE_URL`
   - **Create Token**(Read & Write) → `TURSO_AUTH_TOKEN`
3. 표(테이블)는 서버가 처음 켜질 때 자동으로 만들어요.

## 2. 서버 — Hugging Face Space
1. https://huggingface.co 가입 → 오른쪽 위 **New → Space**
   - Space name: `pokssak-api`(아무거나), SDK: **Docker → Blank**, Hardware: **CPU basic (Free)**
   - 공개 여부: **Public**(Private이면 화면에서 서버에 접속 못 함. 코드만 보이고 비밀값은 안 보여요)
2. Space **Settings → Variables and secrets → New secret** 으로 아래를 넣기(값은 `backend/.env`에서 복사, 채팅에 붙여 넣지 말 것)

| 이름 | 값 |
|---|---|
| `TURSO_DATABASE_URL` `TURSO_AUTH_TOKEN` | 1단계 값 |
| `JUSO_API_KEY` `DATA_GO_KR_SERVICE_KEY` `VWORLD_API_KEY` | `.env`와 같음 |
| `VWORLD_DOMAIN` `FRONTEND_ORIGIN` | Vercel 주소(3단계에서 생김, 예: `https://pokssak.vercel.app`) |
| `ADMIN_EMAILS` | `.env`와 같음 |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` | `.env`와 같음 |
| `KAKAO_REST_API_KEY` | `.env`와 같음 |
| `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` | `.env`와 같음 |

3. 오른쪽 위 프로필 → **Settings → Access Tokens → Create new token**(Type: **Write**) → 복사해 두기(올릴 때 비밀번호로 씀)
4. `저장하고배포.command` 더블클릭 → 처음 한 번 사용자 이름·Space 이름을 묻고, 로그인 창에 사용자 이름과 토큰을 넣기
5. 몇 분 뒤 서버 주소: `https://<사용자이름>-<space이름>.hf.space` (예: `https://kimkh-pokssak-api.hf.space/api/status` 가 열리면 성공)

## 3. 화면 — Vercel
1. https://vercel.com 에 GitHub로 가입 → **Add New → Project → pokssak → Import**
2. **Root Directory**: `frontend`
3. **Environment Variables**
   - `BACKEND_URL` = 서버 주소(`https://<사용자이름>-<space이름>.hf.space`)
   - `NEXT_PUBLIC_SITE_URL` = Vercel 주소(처음엔 비워 두고 배포 후 채워 다시 배포해도 됨)
4. **Deploy** → 생긴 주소를 Space의 `VWORLD_DOMAIN`·`FRONTEND_ORIGIN`에 넣기(Space가 자동 재시작)

## 4. 외부 서비스에 새 주소 등록
| 서비스 | 할 일 |
|---|---|
| Google Cloud 콘솔(OAuth 클라이언트) | 승인된 리디렉션 URI에 `https://<vercel 주소>/api/auth/google/callback` 추가 |
| 브이월드(인증키 관리) | 서비스 URL에 Vercel 주소 추가 |
| 카카오 개발자(플랫폼 → Web) | 사이트 도메인에 Vercel 주소 추가, 카카오맵 서비스 켜기 |

## 5. 확인
- `https://<vercel 주소>` → 주소 조회 → 결과
- 더보기 → 구글 로그인 → 알림 켜기(시험 알림)
- 휴대폰: 안드로이드 크롬은 바로, 아이폰은 사파리 **공유 → 홈 화면에 추가** 후 앱에서 알림 켜기

## 참고
- 서버가 해외(Hugging Face)에 있어요. 일부 공공 API가 해외 접속을 막으면 그 조회만 실패할 수 있어요(배포 후 확인).
- 매일 가격 확인은 서버가 깨어 있을 때 돌아요. 이틀 넘게 아무도 안 쓰면 잠드니, 꼭 매일 돌리려면 cron-job.org(무료)에서 하루 한 번 `https://<서버 주소>/api/status` 를 열게 해 두세요.
- 로컬 DB(`backend/data/app.db`)는 옮기지 않아요. 배포는 빈 DB로 시작합니다.
- 서버는 1개만 실행하세요.
