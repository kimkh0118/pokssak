import { describe, expect, it } from "vitest";
import { simulate, type ScalarParams } from "@/lib/engine/cashflow";
import { breakevenPrice, maxAllowableCost, rentalPayback, solveRoot } from "@/lib/engine/breakeven";
import { housingBrokerageCap, landBrokerageCap } from "@/lib/engine/fees";
import { analyze, type EngineInput } from "@/lib/engine/analyze";

const 억 = 100_000_000;
const 만 = 10_000;

/** 명세 예시: 할인율 0%, 기간 중 추가 수입·지출 없음, 기타 비용에 거래비·세금 포함 */
function specParams(over: Partial<ScalarParams> = {}): ScalarParams {
  return {
    horizonMonths: 36,
    discountRateAnnual: 0,
    priceGrowthAnnual: 0,
    occupancy: "tenant",
    loanBalance: 5000 * 만,
    loanRateAnnual: 0,
    tenantDeposit: 2000 * 만,
    tenantMonthlyRent: 0,
    tenantLeaseEndMonth: 0,
    replacementHousingMonthly: null,
    holdingCostMonthly: 0,
    maintenanceAsIsMonthly: 0,
    asIsPrice: 3 * 억,
    landPrice: 3.5 * 억,
    remodelPrice: null,
    remodelRentMonthly: null,
    remodelVacancyRate: 0,
    remodelMaintenanceMonthly: 0,
    demolitionCost: 3000 * 만,
    demolitionPrepMonths: 1,
    demolitionWorkMonths: 1,
    remodelCost: null,
    remodelPrepMonths: 1,
    remodelWorkMonths: 2,
    saleLeadAsIs: 3,
    saleLeadLand: 4,
    saleLeadRemodeled: 3,
    transaction: { extraFixed: 0, override: { asIsSale: 1000 * 만, landSale: 2000 * 만, remodelSale: null } },
    taxAsIsSale: 0,
    taxLandSale: 0,
    taxRemodelSale: 0,
    ...over,
  };
}

describe("명세 검증 예시", () => {
  it("현상태 매각 순현금 수지 = 2억 2천만 원", () => {
    const r = simulate("sell_as_is", specParams());
    expect(r.computable).toBe(true);
    expect(r.netCash).toBe(22000 * 만);
    expect(r.comparisonValue).toBeCloseTo(22000 * 만, 0);
    expect(r.saleSettlement!.netProceeds).toBe(22000 * 만);
  });

  it("철거 후 매각 순현금 수지 = 2억 3천만 원", () => {
    const r = simulate("demolish_sell_land", specParams());
    expect(r.computable).toBe(true);
    expect(r.netCash).toBe(23000 * 만);
    expect(r.saleSettlement!.netProceeds).toBe(23000 * 만);
    // 대출·보증금은 한 번씩만 차감
    expect(r.flows.filter((f) => f.category === "loan")).toHaveLength(1);
    expect(r.flows.filter((f) => f.category === "deposit")).toHaveLength(1);
  });

  it("철거 후 매각 손익분기 매각가 = 3억 4천만 원", () => {
    const s = breakevenPrice("demolish_sell_land", specParams());
    expect(s.ok).toBe(true);
    if (s.ok) expect(Math.abs(s.value - 34000 * 만)).toBeLessThan(2_000);
  });

  it("철거비 상한 = 4천만 원", () => {
    const s = maxAllowableCost("demolish_sell_land", specParams());
    expect(s.ok).toBe(true);
    if (s.ok) expect(Math.abs(s.value - 4000 * 만)).toBeLessThan(2_000);
  });
});

describe("중복 계산 방지와 현금·자산 구분", () => {
  it("현상태 유지: 집값은 현금 수지에 들어가지 않고 기간 말 보유 순자산으로만 잡힌다", () => {
    const r = simulate("keep", specParams());
    expect(r.flows.some((f) => f.category === "sale")).toBe(false);
    expect(r.netCash).toBe(0);
    expect(r.terminal).not.toBeNull();
    // 3억 − 처분 거래비 1천만 − 대출 5천만 − 보증금 2천만
    expect(r.terminal!.net).toBe(22000 * 만);
    expect(r.comparisonValue).toBeCloseTo(22000 * 만, 0);
  });

  it("매각 시나리오는 기간 말 자산을 다시 더하지 않는다", () => {
    const r = simulate("sell_as_is", specParams());
    expect(r.terminal).toBeNull();
  });

  it("대출 이자를 내도 원금은 한 번만 차감된다", () => {
    const r = simulate("keep", specParams({ loanRateAnnual: 0.06 }));
    const interest = r.flows.filter((f) => f.category === "finance").reduce((a, f) => a + f.amount, 0);
    expect(interest).toBeCloseTo(-5000 * 만 * 0.06 * 3, 0); // 36개월 = 3년
    expect(r.terminal!.loan).toBe(5000 * 만);
    expect(r.flows.some((f) => f.category === "loan")).toBe(false);
  });
});

describe("미입력과 0원 구분", () => {
  it("대출 미확인(null)은 0원과 같은 금액으로 계산하되 '대출 잔액 반영 전'으로 표시한다", () => {
    const unknown = simulate("sell_as_is", specParams({ loanBalance: null }));
    const zero = simulate("sell_as_is", specParams({ loanBalance: 0 }));
    expect(unknown.pending).toContain("대출 잔액 반영 전(미확인)");
    expect(zero.pending).not.toContain("대출 잔액 반영 전(미확인)");
  });

  it("세금 미입력이면 '세금 반영 전'", () => {
    const r = simulate("sell_as_is", specParams({ taxAsIsSale: null }));
    expect(r.pending).toContain("세금 반영 전");
    expect(r.flows.some((f) => f.category === "tax")).toBe(false);
  });

  it("보증금 모름이면 0원으로 처리하지 않고 반영 전으로 표시", () => {
    const r = simulate("sell_as_is", specParams({ tenantDeposit: null }));
    expect(r.pending).toContain("임차보증금 반영 전(미확인)");
  });
});

describe("근거 부족 시 산정 보류", () => {
  it("토지 매각가가 없으면 철거 후 매각은 계산하지 않는다", () => {
    const r = simulate("demolish_sell_land", specParams({ landPrice: null }));
    expect(r.computable).toBe(false);
    expect(r.missing.join()).toContain("토지");
  });
  it("리모델링 후 가치가 없으면 계산하지 않는다", () => {
    const r = simulate("remodel_sell", specParams({ remodelCost: 5000 * 만 }));
    expect(r.computable).toBe(false);
  });
  it("손익분기 해가 없으면 숫자를 만들지 않는다", () => {
    expect(solveRoot((x) => x + 1, 0, 10)).toBeNull();
  });
  it("공사비 0원이어도 불리하면 최대 허용 공사비를 내지 않는다", () => {
    const s = maxAllowableCost("demolish_sell_land", specParams({ landPrice: 2 * 억 }));
    expect(s.ok).toBe(false);
  });
});

describe("최대 선투입 필요액", () => {
  it("보증금 반환과 철거비를 먼저 내야 하므로 누적 최저점이 선투입 필요액", () => {
    const r = simulate("demolish_sell_land", specParams());
    // month0: 보증금 −2천만, month2: 철거비 −3천만 → 누적 최저 −5천만
    expect(r.maxUpfront).toBe(5000 * 만);
  });
});

describe("임대 회수기간", () => {
  it("추가 순수입 기준으로 계산", () => {
    const s = rentalPayback(
      specParams({ remodelCost: 6000 * 만, remodelRentMonthly: 200 * 만, tenantMonthlyRent: 100 * 만, remodelVacancyRate: 0 }),
    );
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.value).toBe(60);
  });
  it("추가 순수입 0 이하는 회수 불가", () => {
    const s = rentalPayback(specParams({ remodelCost: 6000 * 만, remodelRentMonthly: 100 * 만, tenantMonthlyRent: 100 * 만 }));
    expect(s.ok).toBe(false);
  });
});

describe("중개보수 상한", () => {
  it("구간별 상한요율과 한도", () => {
    expect(housingBrokerageCap(4000 * 만)).toBe(240_000);
    expect(housingBrokerageCap(1.5 * 억)).toBe(750_000);
    expect(housingBrokerageCap(1.9 * 억)).toBe(800_000); // 한도 80만
    expect(housingBrokerageCap(3 * 억)).toBe(1_200_000);
    expect(housingBrokerageCap(10 * 억)).toBe(5_000_000);
    expect(landBrokerageCap(3 * 억)).toBe(2_700_000);
  });
});

function engineInput(over: Partial<EngineInput> = {}): EngineInput {
  const r = (v: number) => ({ low: v, base: v, high: v });
  return {
    horizonMonths: 36,
    discountRateAnnual: 0,
    priceGrowthAnnual: 0,
    purpose: "best_price",
    timing: "flexible",
    occupancy: "tenant",
    availableCash: 1 * 억,
    loanBalance: 5000 * 만,
    loanRateAnnual: 0,
    tenantDeposit: 2000 * 만,
    tenantMonthlyRent: 0,
    tenantLeaseEndMonth: 0,
    replacementHousingMonthly: null,
    holdingCostMonthly: 0,
    maintenanceAsIsMonthly: 0,
    asIsPrice: { low: 2.8 * 억, base: 3 * 억, high: 3.2 * 억 },
    landPrice: { low: 3.3 * 억, base: 3.5 * 억, high: 3.7 * 억 },
    remodelPrice: null,
    remodelRentMonthly: null,
    remodelVacancyRate: 0.05,
    remodelMaintenanceMonthly: 0,
    demolitionCost: r(3000 * 만),
    demolitionPrepMonths: r(1),
    demolitionWorkMonths: r(1),
    remodelCost: r(8000 * 만),
    remodelPrepMonths: r(1),
    remodelWorkMonths: r(3),
    saleLeadMonths: { asIs: r(3), land: r(4), remodeled: r(3) },
    transaction: { extraFixed: 0, override: { asIsSale: 1000 * 만, landSale: 2000 * 만, remodelSale: null } },
    taxes: { asIsSale: 0, landSale: 0, remodelSale: 0 },
    ...over,
  };
}

describe("추천 규칙", () => {
  it("차이가 추정 범위보다 작으면 추가 견적·확인 필요", () => {
    const res = analyze(engineInput());
    expect(res.recommendation.verdict).toBe("needs_quotes");
  });

  it("예산을 넘는 선택지는 실행 가능으로 추천하지 않는다", () => {
    const res = analyze(
      engineInput({
        availableCash: 1000 * 만,
        landPrice: { low: 4.5 * 억, base: 4.6 * 억, high: 4.7 * 억 },
        asIsPrice: { low: 3 * 억, base: 3 * 억, high: 3 * 억 },
      }),
    );
    const demo = res.options.find((o) => o.id === "demolish_sell_land")!;
    expect(demo.checks.budget).toBe("exceeds");
    expect(res.recommendation.optionId).not.toBe("demolish_sell_land");
  });

  it("가격 정보가 없으면 현상태 유지가 아니라 판단 보류", () => {
    const res = analyze(engineInput({ asIsPrice: null, landPrice: null, purpose: "undecided" }));
    expect(res.recommendation.verdict).toBe("insufficient_info");
    expect(res.recommendation.optionId).toBeNull();
  });

  it("본인 거주 + 대체 주거비 미입력 + 목적 미정이면 매각과 거주 사이 금전 순위 확정 안 함", () => {
    const res = analyze(
      engineInput({ occupancy: "owner", purpose: "undecided", remodelPrice: { low: 3.3 * 억, base: 3.6 * 억, high: 3.9 * 억 } }),
    );
    expect(res.recommendation.verdict).toBe("insufficient_info");
  });

  it("빠른 매각 목적은 3개월 안에 끝나지 않는 철거안을 제외한다", () => {
    const res = analyze(engineInput({ purpose: "quick_sale", timing: "within_3m" }));
    const demo = res.options.find((o) => o.id === "demolish_sell_land")!;
    expect(demo.checks.timing).toBe("exceeds");
  });
});

describe("계산하지 못한 선택지가 있을 때", () => {
  it("목적에 맞는 선택지가 계산 보류면 강한 추천을 하지 않고 이유를 남긴다", () => {
    const res = analyze(
      engineInput({
        landPrice: null,
        asIsPrice: { low: 3 * 억, base: 3 * 억, high: 3 * 억 },
        purpose: "best_price",
      }),
    );
    expect(res.recommendation.verdict).toBe("recommend");
    expect(res.recommendation.strength).not.toBe("strong");
    expect(res.recommendation.cautions.join()).toContain("비교에서 빠졌습니다");
  });
});
