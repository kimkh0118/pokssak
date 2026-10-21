// 추천 규칙. 순서:
// 1) 목적 부합 → 2) 예산·희망 기간 → 3) 실행 가능 여부·미확인 조건 → 4) 같은 기준의 경제성 비교 → 5) 불확실성으로 추천 강도 결정
// "현상태 유지 추천"과 "정보 부족으로 판단 보류"는 다른 결과다. 정보가 부족하다고 현상태 유지를 추천하지 않는다.
// 업체 수수료·제휴 여부는 입력에 존재하지 않으므로 순위에 영향을 줄 수 없다.

import { TIMING_MONTHS, type OptionId, type Purpose } from "../domain/types";
import { formatWon } from "../domain/units";
import type { EngineInput, OptionAnalysis } from "./analyze";

export interface OptionChecks {
  purposeFit: "fit" | "partial" | "mismatch";
  timing: "ok" | "exceeds" | "na";
  budget: "ok" | "exceeds" | "unknown";
  excludedReason?: string;
}

export type Verdict = "recommend" | "needs_quotes" | "insufficient_info" | "no_feasible";

export const VERDICT_LABEL: Record<Verdict, string> = {
  recommend: "추천",
  needs_quotes: "추가 견적·확인 필요",
  insufficient_info: "정보 부족으로 판단 보류",
  no_feasible: "조건에 맞는 실행 가능한 선택지 없음",
};

export interface Recommendation {
  verdict: Verdict;
  optionId: OptionId | null;
  strength: "strong" | "moderate" | "weak" | null;
  headline: string;
  reasons: string[];
  cautions: string[];
}

const PURPOSE_FIT: Record<Purpose, Partial<Record<OptionId, OptionChecks["purposeFit"]>>> = {
  quick_sale: { sell_as_is: "fit", demolish_sell_land: "partial", remodel: "partial", keep: "mismatch" },
  best_price: { sell_as_is: "fit", demolish_sell_land: "fit", remodel: "fit", keep: "mismatch" },
  live: { sell_as_is: "mismatch", demolish_sell_land: "mismatch", remodel: "fit", keep: "fit" },
  rent: { sell_as_is: "mismatch", demolish_sell_land: "mismatch", remodel: "fit", keep: "fit" },
  undecided: { sell_as_is: "fit", demolish_sell_land: "fit", remodel: "fit", keep: "fit" },
};

/** 집을 떠나는 선택지인지(본인 거주 시 대체 주거비가 필요한지) */
const movesOut = (o: OptionAnalysis) => o.variant !== "keep" && o.variant !== "remodel_live";

export function recommend(options: OptionAnalysis[], input: EngineInput): Recommendation {
  const limit = TIMING_MONTHS[input.timing];

  // 1~3단계: 각 선택지 점검
  for (const o of options) {
    const b = o.scenarios.base;
    const purposeFit = PURPOSE_FIT[input.purpose][o.id] ?? "fit";
    let timing: OptionChecks["timing"] = "na";
    if (o.id !== "keep" && b.computable && limit !== null) timing = b.completionMonth <= limit ? "ok" : "exceeds";
    else if (o.id !== "keep" && b.computable) timing = "ok";
    let budget: OptionChecks["budget"] = "ok";
    if (b.computable && b.maxUpfront > 0) {
      if (input.availableCash === null) budget = "unknown";
      else if (b.maxUpfront > input.availableCash) budget = "exceeds";
    }
    o.checks = { purposeFit, timing, budget };
    if (!b.computable) o.checks.excludedReason = `계산 불가: ${b.missing.join(", ")}`;
    else if (purposeFit === "mismatch") o.checks.excludedReason = "선택한 활용 목적과 맞지 않음";
    else if (timing === "exceeds") o.checks.excludedReason = `희망 시점(${limit}개월) 안에 실행 완료가 어려움`;
    else if (budget === "exceeds")
      o.checks.excludedReason = `최대 선투입 필요액 ${formatWon(b.maxUpfront)}이 투입 가능 현금 ${formatWon(input.availableCash)}을 넘음`;
  }

  const purposeOk = options.filter((o) => o.checks.purposeFit !== "mismatch");
  const computablePurposeOk = purposeOk.filter((o) => o.computable);
  const candidates = computablePurposeOk.filter((o) => !o.checks.excludedReason);
  const cautions: string[] = [];

  if (computablePurposeOk.length === 0) {
    const missing = [...new Set(purposeOk.flatMap((o) => o.missing))];
    return {
      verdict: "insufficient_info",
      optionId: null,
      strength: null,
      headline: "목적에 맞는 선택지를 계산할 정보가 부족해 판단을 보류합니다.",
      reasons: missing.length ? missing : ["주요 가격 정보가 없습니다."],
      cautions: ["정보 부족은 '현상태 유지가 최선'이라는 뜻이 아닙니다. 아래 항목을 보완하면 다시 계산할 수 있습니다."],
    };
  }

  if (candidates.length === 0) {
    return {
      verdict: "no_feasible",
      optionId: null,
      strength: null,
      headline: "현재 예산·희망 시점 조건으로 실행 가능한 선택지가 없습니다.",
      reasons: computablePurposeOk.map((o) => `${o.label}: ${o.checks.excludedReason}`),
      cautions: ["희망 시점이나 투입 가능 자금 조건을 조정하면 결과가 달라질 수 있습니다."],
    };
  }

  // 본인 거주 + 대체 주거비 미입력이면, 집을 떠나는 선택지와 머무는 선택지 사이의 금전 순위를 확정할 수 없다.
  const replacementUnknown = input.occupancy === "owner" && input.replacementHousingMonthly === null;
  const mixesStayAndLeave = candidates.some(movesOut) && candidates.some((o) => !movesOut(o));
  if (replacementUnknown && mixesStayAndLeave && (input.purpose === "live" || input.purpose === "undecided")) {
    return {
      verdict: "insufficient_info",
      optionId: null,
      strength: null,
      headline: "거주를 계속하는 선택과 집을 떠나는 선택을 금전적으로 비교하려면 대체 주거비가 필요합니다.",
      reasons: [
        "매각하거나 공사하는 동안 살 곳의 비용(월세 등)이 입력되지 않았습니다.",
        "'계산 조건 수정'에서 월 대체 주거비를 입력하면 순위를 계산합니다.",
      ],
      cautions: ["판단 보류는 현상태 유지 추천이 아닙니다."],
    };
  }

  // 4단계: 기준 시나리오 비교가치로 정렬
  const sorted = [...candidates].sort((a, b) => b.scenarios.base.comparisonValue - a.scenarios.base.comparisonValue);
  const top = sorted[0];
  const second = sorted[1];
  const halfRange = (o: OptionAnalysis) =>
    o.scenarios.optimistic.computable && o.scenarios.conservative.computable
      ? Math.abs(o.scenarios.optimistic.comparisonValue - o.scenarios.conservative.comparisonValue) / 2
      : Infinity;

  const reasons: string[] = [];
  const tb = top.scenarios.base;
  reasons.push(`같은 기준(${input.horizonMonths}개월, 할인율 ${(input.discountRateAnnual * 100).toFixed(1)}%)으로 비교했을 때 비교가치가 가장 큽니다: ${formatWon(tb.comparisonValue)}.`);
  if (second) {
    reasons.push(`다음 선택지(${second.label})보다 ${formatWon(tb.comparisonValue - second.scenarios.base.comparisonValue)} 많습니다.`);
  }
  if (tb.maxUpfront > 0) {
    reasons.push(
      input.availableCash === null
        ? `최대 ${formatWon(tb.maxUpfront)}의 선투입이 필요하지만 투입 가능 현금이 입력되지 않아 실행 가능 여부를 확정하지 못했습니다.`
        : `최대 선투입 필요액 ${formatWon(tb.maxUpfront)}은 투입 가능 현금 ${formatWon(input.availableCash)} 이내입니다.`,
    );
  }
  for (const o of options) if (o.checks.excludedReason && o.id !== top.id) cautions.push(`${o.label} 제외: ${o.checks.excludedReason}`);

  // 5단계: 불확실성
  const userAssumedPrice =
    (top.id === "remodel") || (top.id === "demolish_sell_land"); // 대안 가격은 근거가 약한 가정인 경우가 많다
  const diff = second ? tb.comparisonValue - second.scenarios.base.comparisonValue : Infinity;
  const band = second ? Math.max(halfRange(top), halfRange(second)) : halfRange(top);
  const majorPending = top.pending.filter((p) => !p.startsWith("세금"));

  if (second && diff < band) {
    return {
      verdict: "needs_quotes",
      optionId: top.id,
      strength: "weak",
      headline: `선두는 '${top.variantLabel}'이지만, 다음 선택지와의 차이(${formatWon(diff)})가 추정 범위(±${formatWon(band)})보다 작아 추가 견적·확인이 필요합니다.`,
      reasons,
      cautions,
    };
  }

  let strength: Recommendation["strength"] = "moderate";
  if (diff >= 2 * band && majorPending.length === 0 && top.checks.budget === "ok" && !userAssumedPrice) strength = "strong";
  if (top.checks.budget === "unknown") cautions.push("투입 가능 현금이 미입력이라 실행 가능 여부가 확정되지 않았습니다.");
  if (majorPending.length) cautions.push(`반영하지 못한 항목: ${majorPending.join(", ")}`);
  if (userAssumedPrice) cautions.push("대안의 매각가·공사비는 견적과 현장 시세로 확인해야 하는 가정입니다.");
  if (top.pending.some((p) => p.startsWith("세금"))) cautions.push("모든 금액은 세금 반영 전입니다.");

  return {
    verdict: "recommend",
    optionId: top.id,
    strength,
    headline: strength === "strong" ? `추천: ${top.variantLabel}` : `우선 검토 권장: ${top.variantLabel}`,
    reasons,
    cautions,
  };
}
