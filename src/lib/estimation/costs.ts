// 철거·리모델링 실행비용 추정.
// 주의: 아래 기본 단가는 MVP 화면 흐름을 위한 "가정값"이다. 공식 통계나 검증된 견적 단가가 아니다.
// 화면에 출처·기준일·적용 지역·적용 면적과 함께 "견적으로 대체 필요"로 표시하고, 사용자가 수정할 수 있다.

import type { Condition, Range } from "../domain/types";

export const COST_ASSUMPTION_SOURCE = "서비스 기본 가정값(공식 단가 아님 · 견적으로 대체 필요)";
export const COST_ASSUMPTION_AS_OF = "2026-10 작성";
export const COST_ASSUMPTION_REGION = "전국 공통(지역 차이 미반영)";

export interface CostLine {
  key: string;
  label: string;
  amount: Range;
  basis: string; // 계산 근거(적용 면적 × 단가 등)
  unitCost?: Range;
  unit?: string;
  appliedArea?: number | null;
  source: string;
  asOf: string;
  region: string;
}

export interface CostEstimate {
  lines: CostLine[];
  total: Range | null;
  withheldReason: string | null;
}

export interface CostUnitAssumptions {
  demolitionPerSqm: Range; // 해체 공사비(원/㎡, 연면적 기준)
  demolitionWastePerSqm: Range; // 폐기물 처리비(원/㎡)
  demolitionSoftCost: Range; // 해체계획서·감리·멸실신고 등 부대비(원, 정액)
  remodelPerSqmPartial: Range; // 부분 리모델링 공사비(원/㎡)
  remodelPerSqmFull: Range; // 전면 리모델링 공사비(원/㎡)
  remodelWastePerSqm: Range;
  remodelSoftCostRate: Range; // 설계·인허가 등 부대비(공사비 대비 비율)
  contingencyRate: number; // 예비비 비율
}

export const DEFAULT_COST_UNITS: CostUnitAssumptions = {
  demolitionPerSqm: { low: 40_000, base: 60_000, high: 85_000 },
  demolitionWastePerSqm: { low: 20_000, base: 30_000, high: 45_000 },
  demolitionSoftCost: { low: 3_000_000, base: 5_000_000, high: 8_000_000 },
  remodelPerSqmPartial: { low: 300_000, base: 450_000, high: 650_000 },
  remodelPerSqmFull: { low: 600_000, base: 900_000, high: 1_300_000 },
  remodelWastePerSqm: { low: 20_000, base: 30_000, high: 40_000 },
  remodelSoftCostRate: { low: 0.05, base: 0.07, high: 0.1 },
  contingencyRate: 0.1,
};

const mul = (r: Range, k: number): Range => ({ low: Math.round(r.low * k), base: Math.round(r.base * k), high: Math.round(r.high * k) });
const sum = (rs: Range[]): Range => ({
  low: rs.reduce((a, r) => a + r.low, 0),
  base: rs.reduce((a, r) => a + r.base, 0),
  high: rs.reduce((a, r) => a + r.high, 0),
});
const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

function line(key: string, label: string, amount: Range, basis: string, extra: Partial<CostLine> = {}): CostLine {
  return { key, label, amount, basis, source: COST_ASSUMPTION_SOURCE, asOf: COST_ASSUMPTION_AS_OF, region: COST_ASSUMPTION_REGION, ...extra };
}

/** 철거 실행비용 = 해체 공사비 + 폐기물 처리비 + 부대비 + 예비비 (보유비·금융비용·이주비는 현금흐름 계산에서 월별로 반영) */
export function estimateDemolition(floorArea: number | null, u: CostUnitAssumptions = DEFAULT_COST_UNITS): CostEstimate {
  if (!floorArea || floorArea <= 0) return { lines: [], total: null, withheldReason: "연면적 정보가 없어 철거비를 추정할 수 없습니다." };
  const work = mul(u.demolitionPerSqm, floorArea);
  const waste = mul(u.demolitionWastePerSqm, floorArea);
  const soft = u.demolitionSoftCost;
  const sub = sum([work, waste, soft]);
  const reserve = mul(sub, u.contingencyRate);
  const lines = [
    line("demolition_work", "해체 공사비", work, `연면적 ${floorArea.toFixed(1)}㎡ × ${won(u.demolitionPerSqm.base)}/㎡(기준)`, { unitCost: u.demolitionPerSqm, unit: "원/㎡", appliedArea: floorArea }),
    line("demolition_waste", "폐기물 처리비", waste, `연면적 ${floorArea.toFixed(1)}㎡ × ${won(u.demolitionWastePerSqm.base)}/㎡(기준)`, { unitCost: u.demolitionWastePerSqm, unit: "원/㎡", appliedArea: floorArea }),
    line("demolition_soft", "부대비(해체계획서·감리·멸실신고 등)", soft, "정액 가정"),
    line("demolition_reserve", "예비비", reserve, `소계의 ${(u.contingencyRate * 100).toFixed(0)}%`),
  ];
  return { lines, total: sum([sub, reserve]), withheldReason: null };
}

export function remodelScopeFor(condition: Condition): "partial" | "full" {
  return condition === "major_repair" ? "full" : "partial";
}

/** 리모델링 실행비용 = 공사비 + 폐기물 처리비 + 설계·인허가 부대비 + 예비비 */
export function estimateRemodel(floorArea: number | null, scope: "partial" | "full", u: CostUnitAssumptions = DEFAULT_COST_UNITS): CostEstimate {
  if (!floorArea || floorArea <= 0) return { lines: [], total: null, withheldReason: "연면적 정보가 없어 리모델링 비용을 추정할 수 없습니다." };
  const unit = scope === "full" ? u.remodelPerSqmFull : u.remodelPerSqmPartial;
  const work = mul(unit, floorArea);
  const waste = mul(u.remodelWastePerSqm, floorArea);
  const soft: Range = {
    low: Math.round(work.low * u.remodelSoftCostRate.low),
    base: Math.round(work.base * u.remodelSoftCostRate.base),
    high: Math.round(work.high * u.remodelSoftCostRate.high),
  };
  const sub = sum([work, waste, soft]);
  const reserve = mul(sub, u.contingencyRate);
  const lines = [
    line("remodel_work", `공사비(${scope === "full" ? "전면" : "부분"} 리모델링)`, work, `연면적 ${floorArea.toFixed(1)}㎡ × ${won(unit.base)}/㎡(기준)`, { unitCost: unit, unit: "원/㎡", appliedArea: floorArea }),
    line("remodel_waste", "폐기물 처리비", waste, `연면적 ${floorArea.toFixed(1)}㎡ × ${won(u.remodelWastePerSqm.base)}/㎡(기준)`, { unitCost: u.remodelWastePerSqm, unit: "원/㎡", appliedArea: floorArea }),
    line("remodel_soft", "설계·인허가 등 부대비", soft, `공사비의 ${(u.remodelSoftCostRate.low * 100).toFixed(0)}~${(u.remodelSoftCostRate.high * 100).toFixed(0)}%`),
    line("remodel_reserve", "예비비", reserve, `소계의 ${(u.contingencyRate * 100).toFixed(0)}%`),
  ];
  return { lines, total: sum([sub, reserve]), withheldReason: null };
}

/** 현 건물 월 유지관리비 가정(상태별). 사용자 입력 상태는 전문 진단이 아니다. */
export const MAINTENANCE_BY_CONDITION: Record<Condition, number> = {
  good: 50_000,
  partial_repair: 150_000,
  major_repair: 300_000,
  unknown: 150_000,
};
