# 부산 빈집 처리 비교

부산 빈집 소유자가 주소를 입력하면 공공데이터 6종을 조회하고, 네 질문과 상담·견적 정보를 반영해
**현 상태 판매**와 **철거 후 토지 판매**의 처리 비용을 뺀 예상 회수액·철거비 손익분기점을 비교합니다.
보유·리모델링 비용 안내, 지원사업 후보(주간 수집), 맞춤형 철거 플랜, 관심자산 저장과 알림을 제공합니다.

> 추천은 입력한 조건에서의 비교 결과입니다. 실제 판매가격·거래 성사·최소 손실·지원금 수령을 보장하지 않습니다.

## 구조

```
backend/   FastAPI · SQLite
  app/
    adapters/   공공 API 어댑터(기관별): juso · building · trades(주택·토지, 전체 페이지) · vworld(토지특성·토지이용계획) · sample
    codes.py    PNU·산 구분·단위 변환        clock.py   한국 시간(테스트에서 주입)
    property.py 주소→6종 조회·공공 점검       comps.py   실거래 정제·유사 사례·참고가격
    eligibility.py 네 질문→분석 경로         engine.py  회수액·K·D*·민감도·추천 상태(규칙 버전)
    explain.py  AI 설명(검증·규칙 기반 대체)   plan.py    맞춤형 철거 플랜
    programs.py 공고 원문·추출·LLM 구조화·근거 검증·검토·발행·매칭
    jobs.py     주간 예약·잠금·재시도·실행 기록   notify.py 알림·outbox·전송
    auth.py     회원·세션                    analyses.py 분석·접근 권한·관심자산
    main.py     API 라우트                   migrations/ DB 스키마(SQL)   seed.py 예시 자료
  tests/      pytest
frontend/  Next.js(React) — 화면만. /api/* 는 백엔드로 전달
scripts/e2e.mjs  서버를 켠 상태에서 전체 흐름 HTTP 점검
dev.sh     백엔드+화면 함께 실행
```

## 설치·실행

필요: Python 3.11+, Node.js 20+

```bash
cp backend/.env.example backend/.env    # 키 입력(없어도 예시 모드 동작)
./dev.sh                                # 또는 VS Code에서 backend/run.py ▶
```

- 화면 http://localhost:3000 · API 문서 http://localhost:8000/docs
- **예시 모드**: 첫 화면 "예시 빈집으로 전체 흐름 보기". 가상의 `부산광역시(예시) 예시구` 주소·거래·지원사업. 실제 조회가 실패해도 예시 데이터로 바꾸지 않습니다.
- **관리자**: `ADMIN_EMAILS`에 적은 이메일로 가입 → `/admin`
- DB 마이그레이션은 서버 시작 시 `backend/app/migrations/*.sql`을 순서대로 자동 적용합니다.

## 검증

```bash
cd backend && .venv/bin/python -m pytest      # 계산·데이터·지원사업·작업·알림·권한·전체 흐름
cd frontend && npm run typecheck && npm run lint && npm run build
node scripts/e2e.mjs                           # 서버 실행 중
```

## 공공 API와 필드 매핑 (2026-10 공식 문서·실제 호출로 확인)

서비스 6개, 인증키 3종. 공공데이터포털은 계정 키 1개로 서비스마다 활용신청이 필요합니다.

| 서비스 | 엔드포인트 | 요청 | 쓰는 응답 필드 |
|---|---|---|---|
| 도로명주소 검색(행정안전부) | `business.juso.go.kr/addrlink/addrLinkApi.do` | confmKey, keyword, resultType=json | roadAddr, jibunAddr, admCd(법정동 10자리), mtYn(0 대지/1 산), lnbrMnnm·lnbrSlno(지번), buldMnnm(건물번호, PNU에 미사용), bdKdcd |
| 건축물대장 표제부(건축HUB, 15134735) | `apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo` | sigunguCd, bjdongCd, platGbCd(0/1), bun, ji, _type=json | mainPurpsCd(Nm), strctCdNm, platArea·totArea(㎡), grndFlrCnt, useAprDay, mainAtchGbCdNm, regstrKindCdNm, bylotCnt |
| 단독·다가구 매매(15126465) | `apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade` | LAWD_CD(시군구 5), DEAL_YMD, pageNo, numOfRows | dealAmount(만원), plottageAr·totalFloorAr(㎡), buildYear(1900=미상), umdNm, jibun(일부 가림), cdealType·cdealDay, houseType, totalCount |
| 토지 매매(15126466) | `apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade` | 위와 같음 | dealAmount(만원), dealArea(㎡), jimok, landUse(용도지역), shareDealingType(지분), cdealType |
| 토지특성(브이월드) | `api.vworld.kr/ned/data/getLandCharacteristics` | key, pnu, format=json + Referer | lndpclAr, lndcgrCodeNm, prposArea1Nm, roadSideCodeNm, tpgrphHg/FrmCodeNm, pblntfPclnd, stdrYear·stdrMt(최신 선택) |
| 토지이용계획(브이월드) | `api.vworld.kr/ned/data/getLandUseAttr` | key, pnu, format=json + Referer | prposAreaDstrcCodeNm, cnflcAtNm, lastUpdtDt (응답 노드 `landUses`) |

- PNU 19자리 = 법정동코드 10 + 대장구분 1(주소 mtYn 0→1 일반, 1→2 산) + 본번 4 + 부번 4. 주소 API는 PNU를 주지 않아 직접 조합합니다.
- 실거래는 `totalCount`로 모든 페이지를 모읍니다. 한 페이지라도 실패한 달은 "조회 실패한 달"로 표시하고 0건으로 보지 않습니다.
- 오류 구분: 키 미설정·인증·호출 제한·결과 없음·기관 일시 오류(코드 04/05 자동 재시도)·네트워크·응답 해석. 서버 로그에 키가 남지 않게 했습니다.

## 계산·추천 규칙 (`engine.py`, 규칙 버전 `busan-vacant-2026.10.1`)

```
N_H = H − M_H − C_H                 N_L = L − D − M_L − C_L + G      Δ = N_L − N_H
K  = L − H − (M_L − M_H)  (추가비용 기준)    D* = K − (C_L − C_H) + G  (철거비 손익분기점)    Δ = D* − D
```
- 금액은 원, 면적은 ㎡. 반올림은 표시 단계에서만.
- 중개보수: 공인중개사법 시행규칙 별표1 상한요율(2021-10-19 시행). 가격이 바뀌면 다시 계산하고, 실제 협의액을 입력하면 그 값을 사용.
- 기본 비교는 지원금 미반영(G=0). 확인된 현금 지원만 별도 시나리오로 반영. 직접 수행·세제·매각 상충·중복 미확인 지원은 G에서 제외.
- 참고가격: 같은 법정동 최근 12개월, 면적 70~130%, 주택 건축연도 ±10년(개발 설정). 0건 보류, 1건 단일 사례, 여러 건 중앙값과 관측 범위(예측구간 아님). 24개월 집단은 별도, 인접동은 경계자료가 없어 미사용.
- 민감도: H·L·D 각 ±10% 8개 조합(범위 입력은 양 끝에 적용, 중개보수 재계산). 개발 점검 가정이며 확률이 아님.
- 상태: **조건부 추천**(상담 가격·견적·비용·기간 확인, 범위 비중첩, 8개 점검 모두 같은 우세) / **우열 불확실** / **추천 보류**. 철거 후 판매 실행 추천은 선지출 자금 확인이 필요(사후 지급 지원은 제외). 계산상 우세(`computedLeader`)와 실행 추천(`executionRecommendation`)은 별도 필드.
- 분석 경로: 부산 단독·다가구, 동일 개인 단독소유(법인·불일치 제외), 전체 미사용(짐 보관은 추가 확인), 범위 명확, 대장·토지 일치일 때만 자동 금액 추천.

## 지원사업 수집·검토·발행·예약

- 파이프라인: 공식 공고 → 원문·해시 → 텍스트 추출(HTML·PDF·HWPX, HWP는 미지원으로 기록) → LLM 구조화(키 없으면 예시 추출기) → 원문 근거 검증 → 검토 대기 → 승인·버전 발행 → 매칭 → 알림.
- 같은 해시는 다시 처리하지 않음. 중요 항목(금액·기간·대상·공공활용·사전승인·직접 수행) 변경은 검토 후 발행, 그동안 "변경 확인 중".
- 예약: 매주 `PROGRAM_SCHEDULE`(기본 월 09:00 KST). 잠금·재시도·실행 기록. 수동 실행: `/admin`의 "지금 수집 실행" 또는
  ```bash
  cd backend && .venv/bin/python -m app.jobs weekly
  ```
- 자동 수집 출처(매주):
  - **정부24 공공서비스(혜택) API**(`adapters/gov24.py`): 부산 소관 서비스 중 빈집·철거·노후주택·슬레이트 관련만. 공공데이터포털에서 '행정안전부_대한민국 공공서비스(혜택) 정보' 활용신청 필요(`GOV24_ENABLED=0`으로 끔).
  - **부산시 고시·공고 게시판 크롤러**(`adapters/busan_gosi.py`): 제목 키워드 검색 → 상세·첨부(hwpx·pdf) 텍스트. 공시송달·입찰 등 제외, 요청 간격 1초, 최대 20건(`BUSAN_GOSI_CRAWL=0`으로 끔).
  - robots.txt는 RFC 9309 기준: 200이면 규칙대로, 4xx면 규칙 없음, 5xx·연결 실패면 수집 안 함.
  - 수집한 공고는 모두 검토 대기 → 관리자 승인 후 발행. 그 밖의 출처는 `/admin` 수동 등록.

## 요구사항별 현황

| 영역 | 구현 | 검증 |
|---|---|---|
| 주소→6종 조회·PNU·범위 점검 | ✅ | 실제 키로 부산 수영구 주소 6종 조회 성공(2026-10-22), 단위 테스트 |
| 네 질문·분석 경로(소유·점유·짐 보관·범위) | ✅ | 테스트 |
| 참고가격(0/1/여러 건, 부분 실패, 제외 사유) | ✅ | 테스트, 실제 자료로 산출 확인 |
| 명세 예시(K=5,950만·D*=5,650만·N_H=9,650만·N_L=1억3,300만·Δ=3,650만) | ✅ | 테스트 |
| 민감도·범위 중첩·동률·음수 D*·선지출·견적 할증 중복 방지 | ✅ | 테스트 |
| 지원금 구분(상한·확정·직접 수행·사후 지급·매각 상충·중복) | ✅ | 테스트 |
| 공고 파이프라인·근거 검증·미검토 발행 방지·버전 보존·HWP 실패 | ✅(예시 추출기) | 테스트, 관리자 화면 |
| 신청기간·한국 시간 마감 재평가(시각 주입) | ✅ | 테스트 |
| 주간 예약·잠금·재시도·실패 기록·수동 실행 | ✅ | 테스트, 관리자 화면 수동 실행 |
| 회원·관심자산 자동 저장·중복 방지·삭제·권한 | ✅ | 테스트, 브라우저 |
| 알림(새 후보·접수 시작·변경·마감)·중복 방지·outbox·재시도·수신 해제 | ✅(앱 내) | 테스트, 브라우저 |
| AI 설명 검증·규칙 기반 대체 | ✅ | 검증 함수 테스트 |
| 화면 9종·모바일 | ✅ | 브라우저(데스크톱·375px) |

## 실제 연동에 필요한 것과 확인하지 못한 것

- **실제 API**: 주소·건축물대장·주택/토지 실거래·토지특성·토지이용계획 모두 실제 키로 정상 조회 확인.
- **실제 공고 수집**: 부산시 고시공고 크롤링은 실제 수집 확인(2026-10-22, 빈집 관련 1건). 정부24 API는 활용신청 전이라 실제 응답 미확인. 구·군청 게시판은 미수집(관리자 수동 등록).
- **LLM 구조화·AI 설명**: ❌ 실제 호출 미확인(`ANTHROPIC_API_KEY` 없음). 키가 없으면 예시 추출기·규칙 기반 설명으로 동작.
- **이메일·문자·푸시 발송**: ❌ 공급자 미설정. 앱 내 알림함만 실제 동작. 공급자 주소를 넣으면 outbox가 POST로 전송·재시도(실제 발송 미확인).
- **운영 예약 실행**: 앱 실행 중 백그라운드 스레드로 동작. 실제 월요일 09:00 실행은 미관찰(시각 계산·잠금은 테스트로 확인).
- **실제 주소·견적 검증**: 사용자가 입력한 상담 가격·견적의 진위는 확인하지 않으며 화면에도 인증이 아님을 표시합니다.
- 이용약관·개인정보처리방침은 초안(운영 주체·보관 기간 미정).
