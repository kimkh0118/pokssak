// 손익분기점 계산.
// - 손익분기 매각가: 대안의 비교가치 = 기준안의 비교가치가 되는 대안 매각가(또는 보유가치)
// - 최대 허용 공사비: 대안의 비교가치 = 기준안의 비교가치가 되는 실행비용 상한
// - 임대 회수기간: 추가 실행비용 ÷ (현상태 임대 대비 추가 순임대수입)
// 가격에 따라 중개보수가 달라지므로 f(x) = 대안 − 기준안 = 0 의 해를 구간 탐색(이분법)으로 찾는다.
// 해가 탐색 범위에 없거나 입력이 부족하면 숫자를 만들지 않고 이유를 돌려준다.

import { simulate, type ScalarParams, type SimOptionId } from "./cashflow";

export type Solved = { ok: true; value: number } | { ok: false; reason: string };

/** f(lo), f(hi) 부호가 다를 때 이분법으로 해를 찾는다. */
export function solveRoot(f: (x: number) => number, lo: number, hi: number, tolerance = 1_000): number | null {
  let flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return null;
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 200 && b - a > tolerance; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(flo)) {
      a = m;
      flo = fm;
    } else {
      b = m;
    }
  }
  return (a + b) / 2;
}

const PRICE_FIELD: Partial<Record<SimOptionId, keyof ScalarParams>> = {
  demolish_sell_land: "landPrice",
  remodel_sell: "remodelPrice",
  remodel_rent: "remodelPrice",
  remodel_live: "remodelPrice",
};
const COST_FIELD: Partial<Record<SimOptionId, keyof ScalarParams>> = {
  demolish_sell_land: "demolitionCost",
  remodel_sell: "remodelCost",
  remodel_rent: "remodelCost",
  remodel_live: "remodelCost",
};

/** 대안별 기준안: 매각형 대안은 현상태 매각, 보유형 대안은 현상태 유지 */
export function baselineFor(option: SimOptionId): SimOptionId {
  return option === "remodel_rent" || option === "remodel_live" ? "keep" : "sell_as_is";
}

function diffFn(option: SimOptionId, field: keyof ScalarParams, p: ScalarParams, baseValue: number) {
  return (x: number) => {
    const r = simulate(option, { ...p, [field]: x });
    return r.computable ? r.comparisonValue - baseValue : NaN;
  };
}

export function breakevenPrice(option: SimOptionId, p: ScalarParams): Solved {
  const field = PRICE_FIELD[option];
  if (!field) return { ok: false, reason: "해당 없음" };
  const base = simulate(baselineFor(option), p);
  if (!base.computable) return { ok: false, reason: `기준안(${baselineFor(option) === "keep" ? "현상태 유지" : "현상태 매각"}) 계산 불가` };
  const ref = Math.max(p.asIsPrice ?? 0, (p[field] as number | null) ?? 0, 100_000_000);
  const f = diffFn(option, field, p, base.comparisonValue);
  if (Number.isNaN(f(ref))) {
    const r = simulate(option, { ...p, [field]: ref });
    return { ok: false, reason: r.missing.join(", ") || "대안 계산 불가" };
  }
  const v = solveRoot(f, 0, ref * 10);
  return v === null ? { ok: false, reason: "탐색 범위(0 ~ 현재 추정가의 10배) 안에 손익분기 가격이 없음" } : { ok: true, value: v };
}

export function maxAllowableCost(option: SimOptionId, p: ScalarParams): Solved {
  const field = COST_FIELD[option];
  if (!field) return { ok: false, reason: "해당 없음" };
  const base = simulate(baselineFor(option), p);
  if (!base.computable) return { ok: false, reason: "기준안 계산 불가" };
  const f = diffFn(option, field, p, base.comparisonValue);
  const atZero = f(0);
  if (Number.isNaN(atZero)) {
    const r = simulate(option, { ...p, [field]: 0 });
    return { ok: false, reason: r.missing.join(", ") || "대안 계산 불가" };
  }
  if (atZero < 0) return { ok: false, reason: "실행비용이 0원이어도 기준안보다 불리함" };
  const ref = Math.max(p.asIsPrice ?? 0, p.landPrice ?? 0, p.remodelPrice ?? 0, 100_000_000);
  const v = solveRoot(f, 0, ref * 5);
  return v === null ? { ok: false, reason: "탐색 범위 안에 해가 없음" } : { ok: true, value: v };
}

/**
 * 임대 목적 회수기간(개월). 총임대료가 아니라 추가 순임대수입 기준.
 * 추가 순수입 = (리모델링 후 월세 × (1−공실률) − 리모델링 후 유지비) − (현재 월세 − 현재 유지비)
 */
export function rentalPayback(p: ScalarParams): Solved & { extraMonthly?: number } {
  if (p.remodelCost === null) return { ok: false, reason: "리모델링 비용 미산정" };
  if (p.remodelRentMonthly === null) return { ok: false, reason: "리모델링 후 예상 월 임대료 미입력" };
  let currentNet = 0;
  if (p.occupancy === "tenant") {
    if (p.tenantMonthlyRent === null) return { ok: false, reason: "현재 월 임대료 미확인" };
    currentNet = p.tenantMonthlyRent - p.maintenanceAsIsMonthly;
  } else {
    currentNet = -p.maintenanceAsIsMonthly; // 현재 임대하지 않는 경우 현 상태 임대수입 0
  }
  const afterNet = p.remodelRentMonthly * (1 - p.remodelVacancyRate) - p.remodelMaintenanceMonthly;
  const extra = afterNet - currentNet;
  if (!(extra > 0)) return { ok: false, reason: "추가 순임대수입이 0 이하라 회수 불가", extraMonthly: extra };
  return { ok: true, value: p.remodelCost / extra, extraMonthly: extra };
}
