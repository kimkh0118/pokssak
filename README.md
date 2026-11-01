# 폭싹 — 부산 빈집 처리 비교

부산 빈집 소유자가 주소를 입력하면 공공데이터를 조회하고, 네 질문과 예상 집값·땅값(중개사 방식)·예상 철거비로
**현 상태 판매**와 **철거 후 토지 판매**의 처리 비용을 뺀 예상 회수액·철거비 손익분기점을 비교합니다.
중개사 방식 집값·땅값 추정, 예상 철거비, 가격 변동 그래프, 관심자산 저장(구글 로그인)과 예상 가격 변동 알림,
관심자산에 등록한 집의 동네 공인중개사무소 연결(국토부 부동산중개업 정보)을 제공하고,
빈집 철거 지원은 국가 빈집 누리집 **빈집애**(www.binzibe.kr)로 연결합니다(지원사업 자체 수집은 하지 않음).

> 추천은 입력한 조건에서의 비교 결과입니다. 실제 판매가격·거래 성사·최소 손실·지원금 수령을 보장하지 않습니다.

## 구조

```
backend/   FastAPI · SQLite
  app/
    adapters/   공공 API 어댑터: juso · building · trades(주택·토지, 전체 페이지) · vworld(토지특성·토지이용계획·개별주택가격) · sample
    codes.py    PNU·산 구분·단위 변환        clock.py   한국 시간(테스트에서 주입)
    property.py 주소→공공자료 조회·공공 점검   comps.py   실거래 정제·유사 사례
    valuation.py 중개사 방식 추정(거래 비교·원가법·공시가격 비율)
    eligibility.py 네 질문→분석 경로         engine.py  회수액·K·D*·민감도·추천 상태(규칙 버전)
    explain.py  AI 설명(검증·규칙 기반 대체)   plan.py    맞춤형 철거 플랜
    auth.py     회원·세션  google_oauth.py 구글 로그인   analyses.py 분석·접근 권한·관심자산
    main.py     API 라우트                   migrations/ DB 스키마(SQL)
  tests/      pytest
frontend/  Next.js(React) — 화면만. /api/* 는 백엔드로 전달
dev.sh     백엔드+화면 함께 실행
```

## 설치·실행

필요: Python 3.11+, Node.js 20+

```bash
cp backend/.env.example backend/.env    # 키 입력
./dev.sh                                # 또는 VS Code에서 backend/run.py ▶
```

- 화면 http://localhost:3000 · API 문서 http://localhost:8000/docs
- 구글 로그인: Google Cloud에서 OAuth 클라이언트(웹)를 만들고 리디렉션 URI `http://localhost:3000/api/auth/google/callback`, `GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET` 입력.
- DB 마이그레이션은 서버 시작 시 `backend/app/migrations/*.sql`을 순서대로 자동 적용합니다(예전 지원사업 테이블은 남아 있지만 쓰지 않음).

## 검증

```bash
cd backend && .venv/bin/python -m pytest      # 계산·데이터·추정·권한·로그인·전체 흐름
cd frontend && npm run typecheck && npm run lint && npm run build
```

## 공공 API와 필드 매핑 (2026-10 공식 문서·실제 호출로 확인)

인증키 3종. 공공데이터포털은 계정 키 1개로 서비스마다 활용신청이 필요합니다.

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
- 화면에는 상담·견적 입력 칸이 없고, 철거비는 `demolition.py` 예상 범위를 가정값으로 넣어 비교합니다(API는 상담 가격·견적 입력을 계속 받음).
- 상태: **조건부 추천**(상담 가격·견적·비용·기간 확인, 범위 비중첩, 8개 점검 모두 같은 우세) / **우열 불확실** / **추천 보류**. 철거 후 판매 실행 추천은 선지출 자금 확인이 필요(사후 지급 지원은 제외). 계산상 우세(`computedLeader`)와 실행 추천(`executionRecommendation`)은 별도 필드.
- 분석 경로: 부산 단독·다가구, 동일 개인 단독소유(법인·불일치 제외), 전체 미사용(짐 보관은 추가 확인), 범위 명확, 대장·토지 일치일 때만 자동 금액 추천.

## 철거 지원 연결

- 결과 화면 '철거 지원'에서 빈집애(www.binzibe.kr/main/)와 지자체 빈집 담당 부서 페이지로 연결만 합니다. 내용을 가져오지 않습니다.
