// 요청 본문 검증. 금액은 원 단위 정수, 0원과 모름/미입력을 구분해 그대로 보존한다.
import type { Answers, MoneyInput, Range } from "../domain/types";
import type { Overrides } from "./buildInput";

export class ValidationError extends Error {
  status = 400;
}

const oneOf = <T extends string>(v: unknown, list: readonly T[], name: string): T => {
  if (typeof v === "string" && (list as readonly string[]).includes(v)) return v as T;
  throw new ValidationError(`${name} 값이 올바르지 않습니다.`);
};

export function validateMoney(v: unknown, name: string): MoneyInput {
  const m = v as { status?: string; won?: unknown } | undefined;
  if (!m || m.status === "unanswered") return { status: "unanswered" };
  if (m.status === "unknown") return { status: "unknown" };
  if (m.status === "known") {
    const won = Number(m.won);
    if (!Number.isFinite(won) || won < 0 || won > 1e13) throw new ValidationError(`${name} 금액이 올바르지 않습니다.`);
    return { status: "known", won: Math.round(won) };
  }
  throw new ValidationError(`${name} 입력 형식이 올바르지 않습니다.`);
}

export function validateAnswers(v: unknown): Answers {
  const a = (v ?? {}) as Record<string, unknown>;
  const occupancy = oneOf(a.occupancy, ["owner", "tenant", "vacant", "unknown"] as const, "사용 상황");
  const rate = a.loanRatePct as { status?: string; pct?: unknown } | undefined;
  let loanRatePct: Answers["loanRatePct"] = { status: "unanswered" };
  if (rate?.status === "unknown") loanRatePct = { status: "unknown" };
  else if (rate?.status === "known") {
    const pct = Number(rate.pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 30) throw new ValidationError("대출 금리가 올바르지 않습니다.");
    loanRatePct = { status: "known", pct };
  }
  let tenant: Answers["tenant"];
  if (occupancy === "tenant") {
    const t = (a.tenant ?? {}) as Record<string, unknown>;
    const le = t.leaseEnd as { status?: string; yyyymm?: unknown } | undefined;
    let leaseEnd: NonNullable<Answers["tenant"]>["leaseEnd"] = { status: "unanswered" };
    if (le?.status === "unknown") leaseEnd = { status: "unknown" };
    else if (le?.status === "known") {
      if (typeof le.yyyymm !== "string" || !/^\d{4}-?\d{2}$/.test(le.yyyymm)) throw new ValidationError("계약 종료 시점이 올바르지 않습니다.");
      leaseEnd = { status: "known", yyyymm: le.yyyymm };
    }
    tenant = { deposit: validateMoney(t.deposit, "보증금"), monthlyRent: validateMoney(t.monthlyRent, "월 임대료"), leaseEnd };
  }
  return {
    purpose: oneOf(a.purpose, ["quick_sale", "best_price", "live", "rent", "undecided"] as const, "활용 목적"),
    timing: oneOf(a.timing, ["within_3m", "within_6m", "within_12m", "flexible"] as const, "희망 실행 시점"),
    occupancy,
    condition: oneOf(a.condition, ["good", "partial_repair", "major_repair", "unknown"] as const, "집 상태"),
    tenant,
    availableCash: validateMoney(a.availableCash, "투입 가능 현금"),
    loanBalance: validateMoney(a.loanBalance, "대출 잔액"),
    loanRatePct,
  };
}

const num = (v: unknown, min: number, max: number, name: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(`${name} 값이 허용 범위를 벗어났습니다.`);
  return n;
};

function range(v: unknown, name: string, max = 1e13): Range | null {
  if (v === null) return null;
  const r = v as Record<string, unknown>;
  const out = { low: num(r.low, 0, max, name), base: num(r.base, 0, max, name), high: num(r.high, 0, max, name) };
  if (!(out.low <= out.base && out.base <= out.high)) throw new ValidationError(`${name}: 낮은 값 ≤ 기준값 ≤ 높은 값이어야 합니다.`);
  return out;
}

/** 허용된 키만 남기고 범위를 검사한다. 키가 없으면 기본 가정값을 쓴다. */
export function validateOverrides(v: unknown): Overrides {
  const o = (v ?? {}) as Record<string, unknown>;
  const out: Overrides = {};
  if (o.horizonMonths !== undefined) out.horizonMonths = Math.round(num(o.horizonMonths, 6, 240, "비교 기간"));
  if (o.discountRatePct !== undefined) out.discountRatePct = num(o.discountRatePct, 0, 30, "할인율");
  if (o.priceGrowthPct !== undefined) out.priceGrowthPct = num(o.priceGrowthPct, -30, 30, "가격변동률");
  for (const k of ["asIsPrice", "landPrice", "remodelPrice", "remodelRentMonthly", "demolitionCost", "remodelCost"] as const) {
    if (o[k] !== undefined) out[k] = range(o[k], k);
  }
  for (const k of ["demolitionWorkMonths", "remodelWorkMonths", "saleLeadAsIs", "saleLeadLand", "saleLeadRemodeled"] as const) {
    if (o[k] !== undefined && o[k] !== null) out[k] = range(o[k], k, 120)!;
  }
  if (o.remodelScope !== undefined) out.remodelScope = oneOf(o.remodelScope, ["partial", "full"] as const, "리모델링 범위");
  if (o.replacementHousingMonthly !== undefined) out.replacementHousingMonthly = o.replacementHousingMonthly === null ? null : num(o.replacementHousingMonthly, 0, 1e9, "대체 주거비");
  for (const k of ["holdingCostMonthly", "maintenanceAsIsMonthly", "remodelMaintenanceMonthly", "transactionExtraFixed"] as const) {
    if (o[k] !== undefined) out[k] = num(o[k], 0, 1e10, k);
  }
  if (o.remodelVacancyPct !== undefined) out.remodelVacancyPct = num(o.remodelVacancyPct, 0, 100, "공실률");
  if (o.taxes !== undefined) {
    const t = o.taxes as Record<string, unknown>;
    const tv = (x: unknown) => (x === null || x === undefined ? null : num(x, 0, 1e12, "세금"));
    out.taxes = { asIsSale: tv(t.asIsSale), landSale: tv(t.landSale), remodelSale: tv(t.remodelSale) };
  }
  return out;
}
