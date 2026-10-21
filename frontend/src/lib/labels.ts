// 화면에 보여주는 한국어 이름
import type { Condition, DelayReason, Occupancy, Provenance, Purpose, Timing, Verdict, ProviderError, Partner } from "./api";

export const PURPOSE_LABEL: Record<Purpose, string> = {
  quick_sale: "빨리 정리",
  profit: "수익 창출",
  live: "직접 사용",
  undecided: "아직 모르겠음",
  best_price: "좋은 가격에 매각",
  rent: "임대 수익",
};
export const PURPOSE_HINT: Partial<Record<Purpose, string>> = {
  quick_sale: "빠르게 팔아 현금으로",
  profit: "팔거나 세를 줘서 더 많이",
  live: "직접 살거나 쓰기",
  undecided: "모든 선택지를 비교해요",
};
export const DELAY_REASON_LABEL: Record<DelayReason, string> = {
  cost: "비용",
  ownership: "소유관계",
  redevelopment: "재개발 기대",
  how_to: "방법을 몰라서",
  other: "기타",
};
export const TIMING_LABEL: Record<Timing, string> = {
  within_3m: "3개월 이내",
  within_6m: "6개월 이내",
  within_12m: "1년 이내",
  flexible: "1년 이상 / 상관없음",
};
export const OCCUPANCY_LABEL: Record<Occupancy, string> = { owner: "본인 거주", tenant: "임차인 거주", vacant: "공실", unknown: "모름" };
export const CONDITION_LABEL: Record<Condition, string> = { good: "바로 사용 가능", partial_repair: "일부 수리 필요", major_repair: "큰 파손 있음", unknown: "모르겠음" };
export const OPTION_LABEL = { sell_as_is: "현상태로 매각", demolish_sell_land: "철거 후 토지 매각", remodel: "리모델링", keep: "현상태 유지" } as const;

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  public_api: "공공데이터 조회값",
  user_input: "사용자 입력값",
  estimate: "추정값",
  sample: "예시 데이터",
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  recommend: "추천",
  needs_quotes: "추가 견적·확인 필요",
  insufficient_info: "정보 부족으로 판단 보류",
  no_feasible: "조건에 맞는 실행 가능한 선택지 없음",
};

export const SCENARIO_LABEL = { conservative: "보수적", base: "기준", optimistic: "낙관적" } as const;

export const FLOW_LABEL: Record<string, string> = {
  sale: "매각대금",
  transaction: "중개·거래비용",
  tax: "세금(입력값)",
  loan: "대출 원금 정산",
  deposit: "임차보증금 반환·정산",
  execution: "철거·리모델링 실행비용",
  holding: "보유비",
  maintenance: "유지관리비",
  finance: "대출이자",
  rent: "임대수입",
  housing: "대체·임시 주거비",
};

export const ERROR_LABEL: Record<ProviderError["kind"], string> = {
  not_configured: "인증키가 설정되지 않았습니다",
  auth: "인증 오류",
  rate_limit: "호출 제한 초과",
  no_result: "조회 결과 없음",
  invalid_request: "요청값 오류",
  upstream: "제공기관 시스템 오류",
  network: "네트워크 오류",
  parse: "응답 해석 오류",
};

export const PARTNER_TYPE_LABEL: Record<Partner["type"], string> = { broker: "공인중개사", demolition: "철거업체", remodeling: "리모델링 회사" };

export const SHAREABLE_FIELDS = {
  name: "이름",
  phone: "연락처",
  address: "물건 주소",
  summary: "분석 요약(선택지별 추정 금액·조건)",
  property: "토지·건축물 기본 정보",
} as const;
export type ShareableField = keyof typeof SHAREABLE_FIELDS;
