# 배포: 화면(Vercel) + 서버(Railway)

GitHub 저장소 `kimkh0118/pokssak`(비공개)를 두 서비스에 연결합니다. `main`에 올리면 둘 다 자동으로 다시 배포됩니다.

## 1. 서버 — Railway
1. https://railway.com 에 GitHub 계정으로 가입 → **New Project → Deploy from GitHub repo → pokssak**
2. 만들어진 서비스 **Settings**
   - **Root Directory**: `backend`
   - **Networking → Generate Domain** → 주소 복사(예: `https://pokssak-api.up.railway.app`)
3. 서비스에서 **+ New → Volume** → Mount path `/data` (DB가 여기 저장돼 재배포해도 유지)
4. **Variables**에 아래 값을 넣기(값은 `backend/.env`에서 복사, 채팅에 붙여 넣지 말 것)

| 이름 | 값 |
|---|---|
| `JUSO_API_KEY` `DATA_GO_KR_SERVICE_KEY` `VWORLD_API_KEY` | `.env`와 같음 |
| `VWORLD_DOMAIN` | Vercel 주소(아래 2단계에서 생김, 예: `https://pokssak.vercel.app`) |
| `FRONTEND_ORIGIN` | Vercel 주소(같은 값) |
| `ADMIN_EMAILS` | `.env`와 같음 |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` | `.env`와 같음 |
| `KAKAO_REST_API_KEY` | `.env`와 같음 |
| `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` `VAPID_SUBJECT` | `.env`와 같음(바꾸면 알림 구독이 끊김) |
| `DATABASE_PATH` | `/data/app.db` |

## 2. 화면 — Vercel
1. https://vercel.com 에 GitHub 계정으로 가입 → **Add New → Project → pokssak → Import**
2. **Root Directory**: `frontend` (Framework: Next.js 자동)
3. **Environment Variables**
   - `BACKEND_URL` = Railway 주소(예: `https://pokssak-api.up.railway.app`)
   - `NEXT_PUBLIC_SITE_URL` = Vercel 주소(예: `https://pokssak.vercel.app`)
4. **Deploy** → 주소 확인 후 Railway의 `VWORLD_DOMAIN`·`FRONTEND_ORIGIN`에 넣고 Railway 재배포

## 3. 외부 서비스에 새 주소 등록
| 서비스 | 할 일 |
|---|---|
| Google Cloud 콘솔(OAuth 클라이언트) | 승인된 리디렉션 URI에 `https://<vercel 주소>/api/auth/google/callback` 추가 |
| 브이월드(인증키 관리) | 서비스 URL에 Vercel 주소 추가(없으면 토지 정보 조회 실패) |
| 카카오 개발자(플랫폼 → Web) | 사이트 도메인에 Vercel 주소 추가, 카카오맵 서비스 켜기 |

## 4. 확인
- `https://<vercel 주소>` 접속 → 주소 조회 → 결과
- 더보기 → 로그인(구글) → 알림 켜기(시험 알림 도착)
- 휴대폰: 안드로이드 크롬은 바로, 아이폰은 사파리 **공유 → 홈 화면에 추가** 후 앱에서 알림 켜기

## 주의
- 로컬 DB(`backend/data/app.db`)는 옮기지 않습니다. 배포 서버는 빈 DB로 시작해요(회원·관심 집은 다시 등록).
- 서버는 1대로만 실행하세요(매일 가격 확인이 중복되지 않게).
