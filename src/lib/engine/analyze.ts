// 계산 입력(EngineInput)을 받아 4개 선택지 × 3개 시나리오를 계산하고 손익분기점과 추천을 만든다.
// LLM 없이 재현 가능한 계산만 수행한다.

import type { Occupancy, OptionId, Purpose, Range, RemodelVariant, Timing } from "../domain/types";
import { OPTION_LABEL, REMODEL_VARIANT_LABEL } from "../domain/types";
import { breakevenPrice, maxAllowableCost, rentalPayback, baselineFor, type Solved } from "./breakeven";
import { simulate, type ScalarParams, type SimOptionId, type SimResult } from "./cashflow";
import type { TransactionCostSetting } from "./fees";
import { recommend, type OptionChecks, type Recommendation } from "./recommend";

export type ScenarioKey = "conservative" | "base" | "optimistic";
export const SCENARIO_LABEL: Record<ScenarioKey, string> = {
  conservative: "보수적",
  base: "기준",
  optimistic: "낙관적",
};

export interface EngineInput {
  horizonMonths: number;
  discountRateAnnual: number;
  priceGrowthAnnual: number;
  purpose: Purpose;
  timing: Timing;
  occupancy: Occupancy;
  availableCash: number | null;
  loanBalance: number | null;
  loanRateAnnual: number | null;
  tenantDeposit: number | null;
  tenantMonthlyRent: number | null;
  tenantLeaseEndMonth: number | null;
  replacementHousingMonthly: number | null;
  holdingCostMonthly: number;
  maintenanceAsIsMonthly: number;
  asIsPrice: Range | null;
  landPrice: Range | null;
  remodelPrice: Range | null;
  remodelRentMonthly: Range | null;
  remodelVacancyRate: number;
  remodelMaintenanceMonthly: number;
  demolitionCost: Range | null;
  demolitionPrepMonths: Range;
  demolitionWorkMonths: Range;
  remodelCost: Range | null;
  remodelPrepMonths: Range;
  remodelWorkMonths: Range;
  saleLeadMonths: { asIs: Range; land: Range; remodeled: Range };
  transaction: TransactionCostSetting;
  taxes: { asIsSale: number | null; landSale: number | null; remodelSale: number | null };
  /** 확인 필요 조건(데이터·입력에서 파생) */
  context?: { condition?: string; isOld?: boolean };
}

/**
 * 시나리오별 값 선택. 보수적: 낮은 가격·높은 비용·긴 기간, 낙관적: 그 반대.
 * 범위는 가정의 폭이며 통계적으로 검증된 확률 구간이 아니다.
 */
export function resolveScenario(input: EngineInput, key: ScenarioKey): ScalarParams {
  const price = (r: Range | null) => (r === null ? null : key === "conservative" ? r.low : key === "optimistic" ? r.high : r.base);
  const cost = (r: Range | null) => (r === null ? null : key === "conservative" ? r.high : key === "optimistic" ? r.low : r.base);
  const dur = (r: Range) => (key === "conservative" ? r.high : key === "optimistic" ? r.low : r.base);
  return {
    horizonMonths: input.horizonMonths,
    discountRateAnnual: input.discountRateAnnual,
    priceGrowthAnnual: input.priceGrowthAnnual,
    occupancy: input.occupancy,
    loanBalance: input.loanBalance,
    loanRateAnnual: input.loanRateAnnual,
    tenantDeposit: input.tenantDeposit,
    tenantMonthlyRent: input.tenantMonthlyRent,
    tenantLeaseEndMonth: input.tenantLeaseEndMonth,
    replacementHousingMonthly: input.replacementHousingMonthly,
    holdingCostMonthly: input.holdingCostMonthly,
    maintenanceAsIsMonthly: input.maintenanceAsIsMonthly,
    asIsPrice: price(input.asIsPrice),
    landPrice: price(input.landPrice),
    remodelPrice: price(input.remodelPrice),
    remodelRentMonthly: price(input.remodelRentMonthly),
    remodelVacancyRate: input.remodelVacancyRate,
    remodelMaintenanceMonthly: input.remodelMaintenanceMonthly,
    demolitionCost: cost(input.demolitionCost),
    demolitionPrepMonths: dur(input.demolitionPrepMonths),
    demolitionWorkMonths: dur(input.demolitionWorkMonths),
    remodelCost: cost(input.remodelCost),
    remodelPrepMonths: dur(input.remodelPrepMonths),
    remodelWorkMonths: dur(input.remodelWorkMonths),
    saleLeadAsIs: dur(input.saleLeadMonths.asIs),
    saleLeadLand: dur(input.saleLeadMonths.land),
    saleLeadRemodeled: dur(input.saleLeadMonths.remodeled),
    transaction: input.transaction,
    taxAsIsSale: input.taxes.asIsSale,
    taxLandSale: input.taxes.landSale,
    taxRemodelSale: input.taxes.remodelSale,
  };
}

export interface OptionAnalysis {
  id: OptionId;
  variant: SimOptionId;
  label: string;
  variantLabel: string;
  scenarios: Record<ScenarioKey, SimResult>;
  computable: boolean;
  missing: string[];
  pending: string[];
  vsSellAsIs: number | null; // 기준 시나리오 비교가치 차이(현상태 매각 대비)
  breakevenPrice: Solved | null;
  maxAllowableCost: Solved | null;
  rentalPayback: (Solved & { extraMonthly?: number }) | null;
  baselineLabel: string | null;
  checks: OptionChecks;
  needsConfirmation: string[];
  remodelAlternatives?: { variant: RemodelVariant; label: string; computable: boolean; comparisonValue: number | null; missing: string[] }[];
}

export interface AnalysisResult {
  options: OptionAnalysis[];
  recommendation: Recommendation;
  globalPending: string[];
  assumptionsNote: string[];
  computedAt: string;
}

function keepVariantLabel(occ: Occupancy): string {
  if (occ === "tenant") return "현 임대 유지";
  if (occ === "owner") return "현 상태로 계속 거주";
  return "현 상태로 보유";
}

function remodelVariantFor(purpose: Purpose): RemodelVariant | null {
  if (purpose === "rent") return "remodel_rent";
  if (purpose === "live") return "remodel_live";
  if (purpose === "quick_sale" || purpose === "best_price") return "remodel_sell";
  return null; // 미정: 계산 가능한 방식 중 선택
}

function confirmations(id: OptionId, input: EngineInput): string[] {
  const list: string[] = ["등기부등본 권리관계(근저당·가압류 등) 확인"];
  if (input.occupancy === "tenant") {
    list.push(
      id === "sell_as_is"
        ? "임차인 승계 또는 계약 종료 협의"
        : id === "keep"
          ? "임대차 갱신 조건"
          : "임차인 계약 종료·명도 일정 협의(계약갱신요구권 등)",
    );
  }
  if (input.occupancy === "unknown") list.push("현재 사용 상황(거주자·임차인 여부)");
  if (id === "demolish_sell_land") {
    list.push("해체(철거) 허가·신고 및 석면 조사 대상 여부", "철거 후 신축 가능 여부(도로 접면·건축선·용도지역 제한)", "토지 매수 수요와 실제 토지 거래가(현장 확인)");
  }
  if (id === "remodel") {
    list.push("구조 안전 확인(사용자가 입력한 상태는 안전진단 결과가 아님)", "대수선·용도변경 해당 여부와 인허가", "리모델링 후 가치·임대료에 대한 현장 시세 확인");
  }
  if (id === "keep" && input.context?.condition === "major_repair") list.push("대규모 보수 필요 상태: 안전 점검과 보수 견적");
  return list;
}

export function analyze(input: EngineInput): AnalysisResult {
  const scen = (variant: SimOptionId) => ({
    conservative: simulate(variant, resolveScenario(input, "conservative")),
    base: simulate(variant, resolveScenario(input, "base")),
    optimistic: simulate(variant, resolveScenario(input, "optimistic")),
  });
  const baseP = resolveScenario(input, "base");

  // 리모델링 방식: 목적에 맞춰 고르고, 미정이면 계산 가능한 방식 중 비교가치가 가장 큰 방식
  const remodelAll = (["remodel_sell", "remodel_rent", "remodel_live"] as RemodelVariant[]).map((v) => ({
    variant: v,
    res: scen(v),
  }));
  let remodelVariant = remodelVariantFor(input.purpose);
  if (!remodelVariant) {
    const ok = remodelAll.filter((x) => x.res.base.computable && !(x.variant === "remodel_live" && input.occupancy !== "owner"));
    ok.sort((a, b) => b.res.base.comparisonValue - a.res.base.comparisonValue);
    remodelVariant = ok[0]?.variant ?? "remodel_sell";
  }

  const defs: { id: OptionId; variant: SimOptionId; variantLabel: string }[] = [
    { id: "sell_as_is", variant: "sell_as_is", variantLabel: "현상태로 매각" },
    { id: "demolish_sell_land", variant: "demolish_sell_land", variantLabel: "철거 후 토지 매각" },
    { id: "remodel", variant: remodelVariant, variantLabel: REMODEL_VARIANT_LABEL[remodelVariant] },
    { id: "keep", variant: "keep", variantLabel: keepVariantLabel(input.occupancy) },
  ];

  const sellBase = simulate("sell_as_is", baseP);

  const options: OptionAnalysis[] = defs.map((d) => {
    const scenarios = d.variant.startsWith("remodel_") ? remodelAll.find((x) => x.variant === d.variant)!.res : scen(d.variant);
    const b = scenarios.base;
    const isAlt = d.id === "demolish_sell_land" || d.id === "remodel";
    const pending = new Set<string>();
    for (const k of ["conservative", "base", "optimistic"] as ScenarioKey[]) scenarios[k].pending.forEach((x) => pending.add(x));
    return {
      id: d.id,
      variant: d.variant,
      label: OPTION_LABEL[d.id],
      variantLabel: d.variantLabel,
      scenarios,
      computable: b.computable,
      missing: b.missing,
      pending: [...pending],
      vsSellAsIs: b.computable && sellBase.computable ? b.comparisonValue - sellBase.comparisonValue : null,
      breakevenPrice: isAlt ? breakevenPrice(d.variant, baseP) : null,
      maxAllowableCost: isAlt ? maxAllowableCost(d.variant, baseP) : null,
      rentalPayback: d.variant === "remodel_rent" ? rentalPayback(baseP) : null,
      baselineLabel: isAlt ? (baselineFor(d.variant) === "keep" ? "현상태 유지" : "현상태 매각") : null,
      checks: { purposeFit: "fit", timing: "na", budget: "ok" },
      needsConfirmation: confirmations(d.id, input),
      remodelAlternatives:
        d.id === "remodel"
          ? remodelAll.map((x) => ({
              variant: x.variant,
              label: REMODEL_VARIANT_LABEL[x.variant],
              computable: x.res.base.computable,
              comparisonValue: x.res.base.computable ? x.res.base.comparisonValue : null,
              missing: x.res.base.missing,
            }))
          : undefined,
    };
  });

  const recommendation = recommend(options, input);

  const globalPending = new Set<string>();
  options.forEach((o) => o.pending.forEach((p) => globalPending.add(p)));

  return {
    options,
    recommendation,
    globalPending: [...globalPending],
    assumptionsNote: [
      `공통 비교 기간 ${input.horizonMonths}개월, 연 할인율 ${(input.discountRateAnnual * 100).toFixed(1)}%, 연 가격변동률 ${(input.priceGrowthAnnual * 100).toFixed(1)}% (모두 수정 가능한 가정)`,
      "비교가치 = 각 월 순현금흐름의 현재가치 합계 + 비교 기간 말 보유 순자산의 현재가치",
      "대출은 이자만 내다가 매각·기간 말에 원금을 정산한다고 가정",
      "보수적·기준·낙관적 범위는 가정의 폭이며 통계적으로 검증된 확률이 아님",
      "업체 수수료나 제휴 여부는 계산·순위에 쓰이지 않음",
    ],
    computedAt: new Date().toISOString(),
  };
}
