# 배포: 화면(Vercel) + 서버(Render) + 데이터(Turso) — 모두 무료, 카드 등록 없음

- **화면**: Vercel이 GitHub `kimkh0118/pokssak`의 `frontend`를 보고 자동 배포
- **서버**: Render가 `render.yaml` 대로 `backend/Dockerfile`을 빌드해 자동 배포(미국 동부)
- **데이터**: Turso(원격 SQLite, 미국 동부). 서버가 다시 켜져도 계정·관심 집·가격 기록이 남음
- **잠 깨우기**: Render 무료 서버는 15분 동안 안 쓰면 잠들어요 → cron-job.org가 10분마다 깨움
- 이후 수정은 루트의 **`저장하고배포.command`** 더블클릭 → GitHub에 올라가면 Vercel·Render가 알아서 다시 배포

## 1. 데이터 — Turso
1. https://turso.tech 에 GitHub로 가입 → **Create Database**(이름 `pokssak`, Location **AWS US East (Virginia)**)
2. 데이터베이스 화면에서 **URL**(`libsql://…turso.io`)과 **Create Token**(Read & Write) 값을 복사
3. 표(테이블)는 서버가 처음 켜질 때 자동으로 만들어요.

## 2. 서버 — Render
1. https://render.com 에 GitHub로 가입 → **New + → Blueprint** → 저장소 `pokssak` 연결
   (저장소가 안 보이면 **Configure GitHub** 에서 pokssak 접근 허용)
2. `render.yaml` 을 읽어 `pokssak-api`(Free) 서비스를 보여줘요. 값 입력 칸이 뜨면 아래를 넣기(값은 `backend/.env`에서 복사, 채팅에 붙여 넣지 말 것)

| 이름 | 값 |
|---|---|
| `TURSO_DATABASE_URL` `TURSO_AUTH_TOKEN` | 1단계 값 |
| `JUSO_API_KEY` `DATA_GO_KR_SERVICE_KEY` `VWORLD_API_KEY` | `.env`와 같음 |
| `VWORLD_DOMAIN` `FRONTEND_ORIGIN` | Vercel 주소(3단계 후 채움. 처음엔 `http://localhost:3000` 넣어 둬도 됨) |
| `ADMIN_EMAILS` `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` `KAKAO_REST_API_KEY` | `.env`와 같음 |
| `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` | `.env`와 같음 |

3. **Apply** → 3~5분 빌드 → 서비스 화면 위쪽의 주소(`https://pokssak-api-xxxx.onrender.com`) 확인
   `…/api/status` 가 열리면 성공

## 3. 화면 — Vercel
1. https://vercel.com 에 GitHub로 가입 → **Add New → Project → pokssak → Import**
2. **Root Directory**: `frontend`
3. **Environment Variables**
   - `BACKEND_URL` = Render 주소
   - `NEXT_PUBLIC_SITE_URL` = Vercel 주소(처음엔 비워 두고 나중에 채워 재배포)
   - `VWORLD_RELAY_SECRET` = 아무도 모르는 긴 임의 문자열(터미널에서 `openssl rand -hex 24` 로 만들기)
4. **Deploy** → 생긴 주소를 Render **Environment** 에 넣기(저장하면 자동 재시작)
   - `VWORLD_DOMAIN`·`FRONTEND_ORIGIN` = Vercel 주소
   - `VWORLD_RELAY_URL` = `https://<vercel 주소>/relay/vworld`
   - `VWORLD_RELAY_SECRET` = 위와 같은 값

> 왜 중계가 필요한가: 브이월드(토지 정보·공시가격·중개사무소)는 해외 서버 접속을 막아요. Render 서버는 미국에 있어서,
> 브이월드 조회만 서울 리전(`frontend/vercel.json` 의 `icn1`)의 Vercel `/relay/vworld` 를 거쳐 불러요.

## 4. 잠 깨우기 — cron-job.org
1. https://cron-job.org 가입 → **Create cronjob**
2. URL `https://<render 주소>/api/status`, 실행 간격 **Every 10 minutes** → 저장
   (매일 가격 확인도 이 덕분에 제때 돌아요. Render 무료 750시간/월이면 서버 1개를 한 달 내내 켤 수 있어요)

## 5. 외부 서비스에 새 주소 등록
| 서비스 | 할 일 |
|---|---|
| Google Cloud 콘솔(OAuth 클라이언트) | 승인된 리디렉션 URI에 `https://<vercel 주소>/api/auth/google/callback` 추가 |
| 브이월드(인증키 관리) | 서비스 URL에 Vercel 주소 추가 |
| 카카오 개발자(플랫폼 → Web) | 사이트 도메인에 Vercel 주소 추가, 카카오맵 서비스 켜기 |

## 6. 확인
- `https://<vercel 주소>` → 주소 조회 → 결과
- 더보기 → 구글 로그인 → 알림 켜기(시험 알림)
- 휴대폰: 안드로이드 크롬은 바로, 아이폰은 사파리 **공유 → 홈 화면에 추가** 후 앱에서 알림 켜기

## 참고
- 서버가 미국에 있어요. 주소·실거래가 API는 해외에서도 되지만 브이월드는 막혀서 위의 서울 중계를 써요.
- Turso를 다른 지역에 만들었다면 `render.yaml` 의 `region` 도 가까운 곳으로 바꾸세요(oregon·ohio·virginia·frankfurt·singapore).
- 로컬 DB(`backend/data/app.db`)는 옮기지 않아요. 배포는 빈 DB로 시작합니다.
- 서버는 1개만 실행하세요.
