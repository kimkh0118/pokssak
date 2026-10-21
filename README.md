# 집 선택 비교

단독·다가구주택 주소와 질문 2개로 **현상태 매각 · 철거 후 토지 매각 · 리모델링 · 현상태 유지**를 같은 기준으로 비교합니다.
비용을 빼고 얼마가 남는지, 어느 가격·공사비부터 다른 선택이 유리해지는지 근거와 함께 보여줍니다.

## 구조

```
부웅산/
├─ backend/            FastAPI (Python) — 공공데이터 조회, 계산, 추천, 저장
│  ├─ app/
│  │  ├─ main.py          API 주소 목록(라우트)
│  │  ├─ public_data.py   공공 API 4종 호출·응답 해석
│  │  ├─ sample_data.py   예시 모드용 가상 데이터
│  │  ├─ property.py      주소 → 토지·건축물·거래 조회, 지원 범위 판정
│  │  ├─ estimates.py     매각가(비교 사례)·철거/리모델링 비용 추정
│  │  ├─ inputs.py        조회 결과 + 답변 + 수정값 → 계산 입력, 출처 목록
│  │  ├─ calculator.py    월 현금흐름·비교가치·손익분기점·중개보수
│  │  ├─ analysis.py      4개 선택지 × 3개 시나리오, 추천 규칙
│  │  ├─ schemas.py       요청 검증(0원 / 모름 / 미입력 구분)
│  │  ├─ storage.py       SQLite 저장
│  │  ├─ labels.py        한국어 이름·금액 표시
│  │  └─ settings.py      환경변수(.env)
│  ├─ tests/              pytest
│  ├─ requirements.txt
│  └─ .env.example
├─ frontend/           Next.js (React) — 화면만. 계산하지 않고 백엔드 결과를 보여줌
│  └─ src/
│     ├─ app/             페이지(폴더 이름 = 주소)
│     ├─ components/      화면 조각(질문 흐름, 결과, 메뉴 등)
│     └─ lib/             api.ts(응답 타입·호출), labels.ts, format.ts, history.ts, site.ts
├─ scripts/e2e.mjs     전체 흐름 HTTP 점검
└─ dev.sh              백엔드 + 프런트엔드 함께 실행
```

화면의 `/api/*` 요청은 `frontend/next.config.ts`의 rewrite로 백엔드(기본 `http://localhost:8000`)에 전달됩니다. 인증키는 백엔드에만 있습니다.

## 실행

필요: Python 3.11+ , Node.js 20+

```bash
cp backend/.env.example backend/.env   # 인증키 입력(없어도 예시 모드는 동작)
./dev.sh                               # 처음 실행 시 패키지 자동 설치
```

- 화면: http://localhost:3000
- API 문서(자동 생성): http://localhost:8000/docs

따로 실행하려면:

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

## 검증

```bash
cd backend && .venv/bin/python -m pytest      # 계산·응답 해석·API 흐름 테스트
cd frontend && npm run typecheck && npm run lint
node scripts/e2e.mjs                           # 서버를 켠 상태에서 전체 흐름 점검
```

## API 인증키 (`backend/.env`)

| 환경변수 | 발급처 | 신청할 서비스 |
|---|---|---|
| `JUSO_API_KEY` | [주소기반산업지원서비스](https://business.juso.go.kr/) | 도로명주소 **검색 API** |
| `DATA_GO_KR_SERVICE_KEY` | [공공데이터포털](https://www.data.go.kr/) (Decoding 키) | [건축HUB 건축물대장정보(15134735)](https://www.data.go.kr/data/15134735/openapi.do), [단독/다가구 매매 실거래가(15126465)](https://www.data.go.kr/data/15126465/openapi.do) |
| `VWORLD_API_KEY`, `VWORLD_DOMAIN` | [브이월드](https://www.vworld.kr/) | 국가중점데이터 토지특성정보. 발급 때 등록한 서비스 URL을 `VWORLD_DOMAIN`에 넣어야 함(Referer로 전송) |

연동 확인(2026-10-21, 실제 키): 주소 검색·건축물대장·실거래가·토지특성 모두 정상 조회. 인증 오류·호출 제한·결과 없음·필드 누락·일부 월 실패를 각각 구분해 표시하며, 실제 조회 실패를 예시 데이터로 바꾸지 않습니다.

## 계산 원칙

- 팔지 않은 집은 현금이 아니라 **기간 말 보유 순자산**으로 따로 표시.
- **비교가치** = 월 순현금흐름 현재가치 합 + 기간 말 보유 순자산 현재가치 (기본 36개월, 할인율 3.5%, 수정 가능).
- 대출·보증금은 한 번만 정산. 대출은 이자만 내다가 매각·기간 말에 원금 정산 가정.
- 세금·대출·보증금을 모르면 0원으로 치지 않고 "세금 반영 전"처럼 표시. 자금·대출은 결과 화면 '계산 조건 수정'에서 선택 입력.
- 현상태 매각가는 주변 실거래 사례(해제·직거래 제외, 면적 0.5~2배, 건축년도 ±15년)의 대지㎡당 가격 분위수. 3건 미만이면 보류. 공시지가는 매각가로 쓰지 않음.
- 철거 후 토지가·리모델링 후 가치는 근거(토지 사례·직접 입력)가 있을 때만 계산.
- 손익분기 매각가·최대 허용 공사비는 `대안 − 기준안 = 0`을 이분법으로 탐색, 해가 없으면 숫자를 내지 않음.
- 추천: 목적 → 예산·시점 → 실행 가능성 → 경제성 → 불확실성. 차이가 추정 범위보다 작으면 "추가 견적·확인 필요", 정보 부족은 "판단 보류"(현상태 유지 추천과 다름).

## 미연동·가정

- 철거·리모델링 단가, 보유비, 공사·매각 기간: 서비스 가정값(공식 단가 아님). 견적으로 바꿔야 함.
- 토지 매매 실거래 API 미연동 → 실제 모드에서 철거 후 토지가는 직접 입력 필요.
- 세금 자동 계산 없음(입력값만 반영). 업체 연동 없음(상담 신청은 저장만, "신청 접수").
- 회원 기능 없음. 결과 링크를 아는 사람은 결과를 볼 수 있음. 이용약관·개인정보처리방침은 초안.
