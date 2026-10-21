// 서비스 전반에서 쓰는 공통 타입.
// 금액은 모두 "원" 단위 정수, 면적은 모두 "㎡" 단위로 저장한다.

/** 데이터 출처 구분 */
export type Provenance = "public_api" | "user_input" | "estimate" | "sample";

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  public_api: "공공데이터 조회값",
  user_input: "사용자 입력값",
  estimate: "추정값",
  sample: "예시 데이터",
};

/** 출처·기준일·조회 시각·단위를 함께 보관하는 값 */
export interface DataPoint<T> {
  value: T | null;
  provenance: Provenance;
  source: string;
  asOf?: string | null; // 데이터 기준일(기관 제공)
  fetchedAt?: string | null; // 조회 시각
  unit?: string;
  note?: string;
}

/**
 * 사용자 금액 입력. 0원과 미입력/모름을 구분한다.
 * - known: 금액을 알고 입력함(0원 포함)
 * - unknown: "모름" 선택
 * - unanswered: 아직 입력하지 않음
 */
export type MoneyInput =
  | { status: "known"; won: number }
  | { status: "unknown" }
  | { status: "unanswered" };

export const isKnown = (m: MoneyInput | undefined | null): m is { status: "known"; won: number } =>
  !!m && m.status === "known" && Number.isFinite(m.won);

/** 보수적·기준·낙관적 값 */
export interface Range {
  low: number; // 보수적 시나리오에서 쓸 값이 아니라 "작은 값"
  base: number;
  high: number; // "큰 값"
}

export type DataMode = "live" | "sample";

export type Purpose = "quick_sale" | "best_price" | "live" | "rent" | "undecided";
export type Timing = "within_3m" | "within_6m" | "within_12m" | "flexible";
export type Occupancy = "owner" | "tenant" | "vacant" | "unknown";
export type Condition = "good" | "partial_repair" | "major_repair" | "unknown";

export const PURPOSE_LABEL: Record<Purpose, string> = {
  quick_sale: "빠르게 매각해 현금 확보",
  best_price: "시간이 걸려도 더 좋은 가격에 매각",
  live: "계속 거주",
  rent: "임대 수익",
  undecided: "아직 결정하지 못함",
};
export const TIMING_LABEL: Record<Timing, string> = {
  within_3m: "3개월 이내",
  within_6m: "6개월 이내",
  within_12m: "1년 이내",
  flexible: "1년 이상 / 상관없음",
};
export const TIMING_MONTHS: Record<Timing, number | null> = {
  within_3m: 3,
  within_6m: 6,
  within_12m: 12,
  flexible: null,
};
export const OCCUPANCY_LABEL: Record<Occupancy, string> = {
  owner: "본인 거주",
  tenant: "임차인 거주",
  vacant: "공실",
  unknown: "모름",
};
export const CONDITION_LABEL: Record<Condition, string> = {
  good: "양호",
  partial_repair: "부분 보수 필요",
  major_repair: "대규모 보수 필요",
  unknown: "모름",
};

/** 핵심 질문 3개에 대한 답 */
export interface Answers {
  purpose: Purpose;
  timing: Timing;
  occupancy: Occupancy;
  condition: Condition;
  tenant?: {
    deposit: MoneyInput;
    monthlyRent: MoneyInput;
    leaseEnd: { status: "known"; yyyymm: string } | { status: "unknown" } | { status: "unanswered" };
  };
  availableCash: MoneyInput;
  loanBalance: MoneyInput;
  loanRatePct: { status: "known"; pct: number } | { status: "unknown" } | { status: "unanswered" };
}

export type OptionId = "sell_as_is" | "demolish_sell_land" | "remodel" | "keep";
export type RemodelVariant = "remodel_sell" | "remodel_rent" | "remodel_live";

export const OPTION_LABEL: Record<OptionId, string> = {
  sell_as_is: "현상태로 매각",
  demolish_sell_land: "철거 후 토지 매각",
  remodel: "리모델링",
  keep: "현상태 유지",
};
export const REMODEL_VARIANT_LABEL: Record<RemodelVariant, string> = {
  remodel_sell: "리모델링 후 매각",
  remodel_rent: "리모델링 후 임대·보유",
  remodel_live: "리모델링 후 거주·보유",
};
