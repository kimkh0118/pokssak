// 백엔드(FastAPI) 응답 타입과 호출 함수. 화면은 계산하지 않고 백엔드 결과를 보여주기만 한다.
// 요청은 같은 주소의 /api/* 로 보내고, next.config.ts 가 백엔드로 넘겨준다.

export type Mode = "live" | "sample";
export type Provenance = "public_api" | "user_input" | "estimate" | "sample";
export type Range = { low: number; base: number; high: number };
export type MoneyInput = { status: "known"; won: number } | { status: "unknown" } | { status: "unanswered" };

export type Purpose = "quick_sale" | "profit" | "live" | "undecided" | "best_price" | "rent";
export type DelayReason = "cost" | "ownership" | "redevelopment" | "how_to" | "other";
export type Timing = "within_3m" | "within_6m" | "within_12m" | "flexible";
export type Occupancy = "owner" | "tenant" | "vacant" | "unknown";
export type Condition = "good" | "partial_repair" | "major_repair" | "unknown";
export type OptionId = "sell_as_is" | "demolish_sell_land" | "remodel" | "keep";
export type Verdict = "recommend" | "needs_quotes" | "insufficient_info" | "no_feasible";

export interface Answers {
  purpose: Purpose; // 질문 1
  condition: Condition; // 질문 2
  delayReason?: DelayReason | null; // 질문 3
  timing: Timing; // 계산 조건 수정
  occupancy: Occupancy; // 계산 조건 수정
  tenant?: {
    deposit: MoneyInput;
    monthlyRent: MoneyInput;
    leaseEnd: { status: "known"; yyyymm: string } | { status: "unknown" } | { status: "unanswered" };
  } | null;
  availableCash: MoneyInput;
  loanBalance: MoneyInput;
  loanRatePct: { status: "known"; pct: number } | { status: "unknown" } | { status: "unanswered" };
}

export interface Overrides {
  horizonMonths?: number;
  discountRatePct?: number;
  priceGrowthPct?: number;
  asIsPrice?: Range;
  landPrice?: Range;
  remodelPrice?: Range;
  remodelRentMonthly?: Range;
  demolitionCost?: Range;
  remodelCost?: Range;
  remodelScope?: "partial" | "full";
  replacementHousingMonthly?: number;
  holdingCostMonthly?: number;
  taxes?: { asIsSale: number | null; landSale: number | null; remodelSale: number | null };
}

// ---- 공공데이터 조회
export interface ProviderError {
  kind: "not_configured" | "auth" | "rate_limit" | "no_result" | "invalid_request" | "upstream" | "network" | "parse";
  message: string;
  source: string;
  code?: string | null;
}
export type Fetched<T> =
  | { ok: true; data: T; meta: { source: string; provenance: Provenance; fetchedAt: string; asOf?: string | null; missingFields?: string[]; note?: string | null } }
  | { ok: false; error: ProviderError };

export interface Address {
  id: string;
  roadAddr: string;
  jibunAddr: string;
  admCd: string;
  bdNm: string | null;
  bdKdcd: "0" | "1" | null;
  emdNm: string;
  provenance: Provenance;
  [key: string]: unknown;
}

export interface Building {
  mgmBldrgstPk: string | null;
  mainAtchGbCdNm: string | null;
  mainPurpsCdNm: string | null;
  strctCdNm: string | null;
  totArea: number | null;
  grndFlrCnt: number | null;
  useAprDay: string | null;
  dongNm: string | null;
}

export interface Land {
  lndcgrCodeNm: string | null;
  lndpclAr: number | null;
  prposArea1Nm: string | null;
  pblntfPclnd: number | null;
  stdrYear: string | null;
}

export interface Trade {
  umdNm: string | null;
  jibunPartial: string | null;
  landArea: number | null;
  floorArea: number | null;
  dealDate: string;
  amountWon: number | null;
  buildYear: number | null;
}

export interface PropertyLookup {
  id: string;
  mode: Mode;
  address: Address;
  land: Fetched<Land>;
  buildings: Fetched<Building[]>;
  trades: Fetched<Trade[]>;
  scope: { status: "supported" | "unsupported" | "unconfirmed"; reason: string };
  targetReasons: string[];
  mainBuildings: Building[];
}

// ---- 계산 결과
export interface Solved {
  ok: boolean;
  value?: number;
  reason?: string;
  extraMonthly?: number;
}

export interface Scenario {
  computable: boolean;
  missing: string[];
  pending: string[];
  flows: { month: number; amount: number; category: string; label: string }[];
  netCash: number;
  terminal: { propertyValue: number; disposalCost: number; tax: number | null; loan: number; deposit: number; net: number } | null;
  comparisonValue: number;
  saleSettlement: {
    month: number; price: number; transaction: number; tax: number | null; loan: number; deposit: number;
    executionCost: number; holdingAndFinance: number; netProceeds: number;
  } | null;
  completionMonth: number;
  maxUpfront: number;
}

export interface OptionResult {
  id: OptionId;
  variant: string;
  label: string;
  variantLabel: string;
  scenarios: Record<"conservative" | "base" | "optimistic", Scenario>;
  computable: boolean;
  missing: string[];
  pending: string[];
  vsSellAsIs: number | null;
  breakevenPrice: Solved | null;
  maxAllowableCost: Solved | null;
  rentalPayback: Solved | null;
  baselineLabel: string | null;
  checks: { purposeFit: "fit" | "partial" | "mismatch"; timing: "ok" | "exceeds" | "na"; budget: "ok" | "exceeds" | "unknown"; excludedReason?: string };
  needsConfirmation: string[];
  remodelAlternatives: { variant: string; label: string; computable: boolean; comparisonValue: number | null; missing: string[] }[] | null;
}

export interface Recommendation {
  verdict: Verdict;
  optionId: OptionId | null;
  strength: "strong" | "moderate" | "weak" | null;
  headline: string;
  reasons: string[];
  cautions: string[];
}

export interface CompEstimate {
  range: Range | null;
  basis: "same_dong" | "district" | null;
  sampleSize: number;
  pricePerLandSqm: Range | null;
  decisions: { trade: Trade; included: boolean; reason: string }[];
  criteria: string[];
  withheldReason: string | null;
}

export interface CostEstimate {
  lines: { key: string; label: string; amount: Range; basis: string; region: string; asOf: string }[];
  total: Range | null;
  withheldReason: string | null;
}

export interface Analysis {
  id: string;
  mode: Mode;
  updatedAt: string;
  answers: Answers;
  overrides: Overrides;
  property: PropertyLookup;
  current: {
    horizonMonths: number;
    discountRatePct: number;
    priceGrowthPct: number;
    replacementHousingMonthly: number | null;
    holdingCostMonthly: number;
    asIsPrice: Range | null;
    landPrice: Range | null;
    remodelPrice: Range | null;
    remodelRentMonthly: Range | null;
    demolitionCost: Range | null;
    remodelCost: Range | null;
  };
  facts: { key: string; label: string; value: string | number | null; unit?: string; provenance: Provenance; source: string; asOf?: string | null; fetchedAt?: string | null; note?: string }[];
  assumptions: { key: string; group: string; label: string; display: string; provenance: Provenance; source: string; asOf?: string | null; note?: string | null }[];
  comps: CompEstimate;
  landComps: CompEstimate;
  remodelComps: CompEstimate;
  costs: { demolition: CostEstimate; remodel: CostEstimate };
  subject: { landArea: number | null };
  result: { options: OptionResult[]; recommendation: Recommendation; globalPending: string[] };
  consultations: { id: string; optionId: OptionId; partnerType: string; status: string; createdAt: string }[];
}

export interface Partner {
  id: string;
  type: "broker" | "demolition" | "remodeling";
  name: string;
  isSample: boolean;
}

// ---- 호출 도우미: 오류는 { error: "메시지" } 로 온다
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했습니다." }));
  if (typeof body?.error === "string") throw new Error(body.error);
  return body as T;
}
