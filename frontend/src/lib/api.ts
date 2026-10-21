// 백엔드(FastAPI) 응답 타입과 호출. 화면은 계산하지 않고 서버 결과를 보여준다. /api/* 는 next.config.ts 가 백엔드로 넘긴다.

export type Mode = "live" | "sample";
export type Kind = "consult" | "public" | "assumption" | "unknown" | "none" | "rule";
export type Pair = [number, number];

export interface Evidence {
  kind: Kind;
  value?: number;
  min?: number;
  max?: number;
  unit?: string;
  source?: string;
  checkedOn?: string;
  scope?: string;
  priceType?: "as_is" | "land";
  scopeMatches?: boolean;
  siteConditionShared?: boolean;
  wishPrice?: boolean;
  items?: Record<string, "included" | "excluded" | "excluded_na" | "unknown">;
  siteWorkConfirmed?: boolean;
  note?: string;
}

export interface ProviderError { kind: string; message: string; source: string; code?: string | null }
export type Fetched<T> =
  | { ok: true; data: T; meta: { source: string; provenance: string; fetchedAt: string; asOf?: string | null; missingFields?: string[]; note?: string | null }; failedMonths?: string[] }
  | { ok: false; error: ProviderError };

export interface Address {
  id: string; roadAddr: string; jibunAddr: string; admCd: string; pnu: string | null; bdKdcd: string | null;
  bdNm: string | null; sggNm: string; emdNm: string; provenance: string;
}
export interface Building {
  mgmBldrgstPk: string | null; mainAtchGbCdNm: string | null; mainPurpsCdNm: string | null; strctCdNm: string | null;
  platArea: number | null; totArea: number | null; grndFlrCnt: number | null; useAprDay: string | null; dongNm: string | null; bylotCnt: number | null;
}
export interface Land {
  lndcgrCodeNm: string | null; lndpclAr: number | null; prposArea1Nm: string | null; roadSideCodeNm: string | null;
  tpgrphHgCodeNm: string | null; tpgrphFrmCodeNm: string | null; pblntfPclnd: number | null; stdrYear: string | null;
}
export interface Check { key: string; label: string; status: "pass" | "fail" | "unknown"; detail: string }
export interface Lookup {
  id: string; mode: Mode; address: Address; pnu: string; buildings: Fetched<Building[]>; land: Fetched<Land>;
  landUse: Fetched<{ name: string; conflict: string; updated: string }[]>; houseTrades: Fetched<unknown[]>; landTrades: Fetched<unknown[]>;
  mainBuildings: Building[]; checks: Check[];
}

export interface Answers {
  ownership: "single" | "joint" | "other"; corporate?: boolean; ownerMismatch?: boolean;
  usage: "vacant" | "storage" | "occupied" | "unknown"; storageFollowup?: { inUse?: string; cleanupKnown?: string } | null;
  direction: "recovery" | "fast" | "undecided"; condition: "usable" | "old" | "severe" | "unknown";
  access: "good" | "narrow" | "none" | "unknown"; vacancyMonths?: number | null;
  scope?: { buildingKey?: string | null; costsSeparable?: boolean };
}

export interface Scenario {
  H: number; L: number; D: number; M_H: number; M_L: number; C_H: number; C_L: number; G: number;
  N_H: number; N_L: number; delta: number; K: number; D_star: number;
}
export interface Compare {
  base: Scenario; ranges: { N_H: Pair; N_L: Pair }; overlap: boolean;
  sensitivity: { H: number; L: number; D: number; deltaMin: number; deltaMax: number; winner: string }[];
  consistentWinner: string | null;
}
export interface Result {
  ruleVersion: string; status: "conditional" | "uncertain" | "hold"; computedLeader: string | null; executionRecommendation: string | null;
  reasons: string[]; missing: string[]; label: string; sensitivityAssumption: number;
  calc: null | { withoutSupport: Compare; withSupport: Compare | null; demolitionKnown: boolean; costsComplete: boolean; priceBasis: { H: string | null; L: string | null } };
  demolition: { range: Pair | null; basis: string | null; problems: string[]; note: string | null };
  costs: { C_H: { range: Pair; missing: string[] }; C_L: { range: Pair; missing: string[] } };
  support: { G: number; prepaid: number; used: { name: string; amount: number }[]; excluded: string[] };
  brokerageRule: { name: string; effective: string; version: string; note: string };
}
export interface Reference {
  label: string; status: "withheld" | "single" | "median"; value: number | null; range: { min: number; max: number } | null;
  sampleSize: number; notes: string[]; rule: { areaRatio: Pair; buildYearGap: number };
  decisions: { trade: { dealDate: string; umdNm: string; jibunMasked: string; landArea: number; floorArea?: number; buildYear?: number; amountWon: number; jimok?: string }; included: boolean; reason: string }[];
  extended: { sampleSize: number; value: number; range: { min: number; max: number }; note: string } | null;
}
export interface ProgramMatch {
  programId: string; versionId: string; title: string | null; agency: string | null; status: string; reviewState: string; isSample: boolean;
  url: string; lastSuccessFetchAt: string | null; benefitType: string | null; benefitCap: number | null; paymentTiming: string | null;
  saleCompatible: boolean | null; contact: string | null; result: "partial_match" | "needs_check" | "mismatch" | "closed";
  items: { label: string; status: string; detail: string }[];
}
export interface PlanStep { no: number; title: string; status: "done" | "todo" | "blocked"; detail: string; contact?: string }
export interface Analysis {
  id: string; mode: Mode; ruleVersion: string; updatedAt: string; address: Address; pnu: string; checks: Check[];
  public: { buildings: Fetched<Building[]>; land: Fetched<Land>; landUse: Lookup["landUse"]; mainBuildings: Building[]; building: Building | null };
  tradeStatus: Record<"houseTrades" | "landTrades", { ok: boolean; failedMonths?: string[]; error?: ProviderError }>;
  answers: Answers; inputs: Record<string, unknown>;
  eligibility: { amountRecommendationAllowed: boolean; holdReasons: string[]; confirmations: string[]; contacts: string[]; notice: string; labels: Record<string, string | null> };
  reference: { house: Reference; land: Reference }; result: Result;
  explanation: { summary: string; nextSteps: string[]; source: "rule" | "ai"; aiError?: string };
  holding: { perYear: Pair | null; totals: Record<string, Pair> | null; unreflected: string[]; plan: string | null; note: string };
  remodel: { enabled: boolean; need?: string[]; N_R?: number; range?: Pair; note?: string };
  programs: ProgramMatch[]; plan: PlanStep[];
}
export interface User { id: string; email: string; isAdmin: boolean }

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했습니다." }));
  if (typeof body?.error === "string") throw new Error(body.error);
  return body as T;
}
