// 시나리오별 월 단위 현금흐름 계산. 순수 함수만 둔다(입력이 같으면 결과가 같다).
//
// 원칙
// - 현금 수지(실제로 들어오고 나가는 돈)와 보유 순자산(팔지 않은 부동산 가치 − 부채)을 구분한다.
// - 대출과 임차보증금은 시나리오마다 한 번만 정산한다.
// - 이미 매각한 부동산은 기간 말 자산에 다시 더하지 않는다.
// - 대출은 기본적으로 이자만 내다가 매각 또는 기간 말에 원금을 정산한다고 가정한다(원금 분할상환 미반영).
// - 값이 null 이면 "미확인"이다. 0으로 바꾸지 않고, 반영하지 못한 항목(pending)으로 기록한다.

import type { Occupancy, RemodelVariant } from "../domain/types";
import { transactionCost, type SaleKind, type TransactionCostSetting } from "./fees";

export type SimOptionId = "sell_as_is" | "demolish_sell_land" | RemodelVariant | "keep";

export interface ScalarParams {
  horizonMonths: number;
  discountRateAnnual: number;
  priceGrowthAnnual: number;
  occupancy: Occupancy;
  loanBalance: number | null;
  loanRateAnnual: number | null;
  tenantDeposit: number | null;
  tenantMonthlyRent: number | null;
  tenantLeaseEndMonth: number | null;
  replacementHousingMonthly: number | null;
  holdingCostMonthly: number;
  maintenanceAsIsMonthly: number;
  asIsPrice: number | null;
  landPrice: number | null;
  remodelPrice: number | null;
  remodelRentMonthly: number | null;
  remodelVacancyRate: number;
  remodelMaintenanceMonthly: number;
  demolitionCost: number | null;
  demolitionPrepMonths: number;
  demolitionWorkMonths: number;
  remodelCost: number | null;
  remodelPrepMonths: number;
  remodelWorkMonths: number;
  saleLeadAsIs: number;
  saleLeadLand: number;
  saleLeadRemodeled: number;
  transaction: TransactionCostSetting;
  taxAsIsSale: number | null;
  taxLandSale: number | null;
  taxRemodelSale: number | null;
}

export type FlowCategory =
  | "sale"
  | "transaction"
  | "tax"
  | "loan"
  | "deposit"
  | "execution"
  | "holding"
  | "maintenance"
  | "finance"
  | "rent"
  | "housing";

export const FLOW_CATEGORY_LABEL: Record<FlowCategory, string> = {
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

export interface FlowEntry {
  month: number;
  amount: number; // 들어오면 +, 나가면 −
  category: FlowCategory;
  label: string;
}

export interface TerminalAssets {
  propertyValue: number;
  disposalCost: number;
  tax: number | null; // null = 세금 반영 전
  loan: number;
  deposit: number;
  net: number;
  pv: number;
}

export interface SaleSettlement {
  month: number;
  price: number;
  transaction: number;
  tax: number | null;
  loan: number;
  deposit: number; // 매매대금에서 정산하거나 앞서 반환한 보증금
  executionCost: number;
  holdingAndFinance: number; // 실행 기간(매각 시점까지)의 보유비·유지비·금융비용
  /** 예상 순수령액(명세 공식). 반영하지 못한 항목은 pending 참고 */
  netProceeds: number;
}

export interface SimResult {
  option: SimOptionId;
  computable: boolean;
  missing: string[]; // 계산할 수 없는 이유
  pending: string[]; // 반영하지 못한 항목(예: 세금 반영 전)
  flows: FlowEntry[];
  netCash: number; // 기간 내 순현금 수지(명목)
  pvCash: number;
  terminal: TerminalAssets | null; // 기간 말 보유 순자산(보유하는 경우만)
  comparisonValue: number;
  saleSettlement: SaleSettlement | null;
  completionMonth: number; // 실행 완료(매각 또는 공사 완료) 시점
  executionCost: number;
  maxUpfront: number; // 최대 선투입 필요액
  monthlyNet: number[];
}

const EMPTY = (option: SimOptionId, missing: string[], pending: string[] = []): SimResult => ({
  option,
  computable: false,
  missing,
  pending,
  flows: [],
  netCash: 0,
  pvCash: 0,
  terminal: null,
  comparisonValue: 0,
  saleSettlement: null,
  completionMonth: 0,
  executionCost: 0,
  maxUpfront: 0,
  monthlyNet: [],
});

export function presentValue(amount: number, month: number, discountRateAnnual: number): number {
  return amount / Math.pow(1 + discountRateAnnual, month / 12);
}

const grown = (p: number, month: number, g: number) => p * Math.pow(1 + g, month / 12);

interface Ctx {
  p: ScalarParams;
  flows: FlowEntry[];
  pending: Set<string>;
}

function add(ctx: Ctx, month: number, amount: number, category: FlowCategory, label: string) {
  if (amount === 0) return;
  ctx.flows.push({ month, amount, category, label });
}

/** 부동산을 보유하는 동안(1..untilMonth) 보유비·금융비용 */
function holdingAndFinance(ctx: Ctx, fromMonth: number, untilMonth: number) {
  const { p } = ctx;
  for (let t = fromMonth; t <= untilMonth; t++) {
    add(ctx, t, -p.holdingCostMonthly, "holding", "보유비(가정)");
    if (p.loanBalance !== null && p.loanBalance > 0) {
      if (p.loanRateAnnual !== null) {
        add(ctx, t, -(p.loanBalance * p.loanRateAnnual) / 12, "finance", "대출이자(이자만 상환 가정)");
      } else {
        ctx.pending.add("대출이자 반영 전(금리 미확인)");
      }
    }
  }
}

function maintenance(ctx: Ctx, fromMonth: number, untilMonth: number, monthly: number, label: string) {
  for (let t = fromMonth; t <= untilMonth; t++) add(ctx, t, -monthly, "maintenance", label);
}

function rentIncome(ctx: Ctx, fromMonth: number, untilMonth: number, monthly: number, label: string) {
  for (let t = fromMonth; t <= untilMonth; t++) add(ctx, t, monthly, "rent", label);
}

/** 본인 거주였던 집에서 나가 있는 기간의 대체·임시 주거비 */
function replacementHousing(ctx: Ctx, fromMonth: number, untilMonth: number, label: string) {
  const { p } = ctx;
  if (p.occupancy !== "owner" || fromMonth > untilMonth) return;
  if (p.replacementHousingMonthly === null) {
    ctx.pending.add("대체·임시 주거비 반영 전(미입력)");
    return;
  }
  for (let t = fromMonth; t <= untilMonth; t++) add(ctx, t, -p.replacementHousingMonthly, "housing", label);
}

function loanAmount(ctx: Ctx): number {
  if (ctx.p.loanBalance === null) {
    ctx.pending.add("대출 잔액 반영 전(미확인)");
    return 0;
  }
  return ctx.p.loanBalance;
}

function depositAmount(ctx: Ctx): number {
  if (ctx.p.occupancy !== "tenant") return 0;
  if (ctx.p.tenantDeposit === null) {
    ctx.pending.add("임차보증금 반영 전(미확인)");
    return 0;
  }
  return ctx.p.tenantDeposit;
}

function tenantRent(ctx: Ctx): number {
  if (ctx.p.occupancy !== "tenant") return 0;
  if (ctx.p.tenantMonthlyRent === null) {
    ctx.pending.add("현재 월 임대료 반영 전(미확인)");
    return 0;
  }
  return ctx.p.tenantMonthlyRent;
}

function taxOrPending(ctx: Ctx, tax: number | null): number | null {
  if (tax === null) {
    ctx.pending.add("세금 반영 전");
    return null;
  }
  return tax;
}

/** 임차인 거주 시 철거·리모델링을 시작할 수 있는 시점(계약 종료) */
function vacateMonth(ctx: Ctx): number {
  const { p } = ctx;
  if (p.occupancy !== "tenant") return 0;
  if (p.tenantLeaseEndMonth === null) {
    ctx.pending.add("임대차 종료 시점 미확인(즉시 명도 가정)");
    return 0;
  }
  return Math.max(0, p.tenantLeaseEndMonth);
}

function sell(
  ctx: Ctx,
  month: number,
  price: number,
  kind: SaleKind,
  tax: number | null,
  depositSettledAtSale: boolean,
) {
  const sale = grown(price, month, ctx.p.priceGrowthAnnual);
  const fee = transactionCost(sale, kind, ctx.p.transaction);
  const t = taxOrPending(ctx, tax);
  const loan = loanAmount(ctx);
  add(ctx, month, sale, "sale", "매각대금");
  add(ctx, month, -fee, "transaction", ctx.p.transaction.override[kind] !== null ? "거래비용(사용자 입력 고정값)" : "중개보수 상한 추정 + 기타 거래비");
  if (t !== null) add(ctx, month, -t, "tax", "세금(사용자 입력)");
  add(ctx, month, -loan, "loan", "대출 원금 정산");
  let deposit = 0;
  if (depositSettledAtSale) {
    deposit = depositAmount(ctx);
    add(ctx, month, -deposit, "deposit", "임차보증금 매매대금에서 정산");
  }
  return { sale, fee, tax: t, loan, deposit };
}

function finish(
  option: SimOptionId,
  ctx: Ctx,
  opts: {
    completionMonth: number;
    executionCost: number;
    saleInfo: ReturnType<typeof sell> | null;
    saleMonth: number | null;
    priorDeposit: number;
    terminal: { value: number; taxPref: number | null; kind: SaleKind; deposit: number } | null;
  },
): SimResult {
  const { p } = ctx;
  const H = p.horizonMonths;
  const monthlyNet = new Array<number>(H + 1).fill(0);
  for (const f of ctx.flows) monthlyNet[f.month] += f.amount;
  const netCash = monthlyNet.reduce((a, b) => a + b, 0);
  const pvCash = monthlyNet.reduce((a, v, t) => a + presentValue(v, t, p.discountRateAnnual), 0);

  let cum = 0;
  let minCum = 0;
  for (const v of monthlyNet) {
    cum += v;
    minCum = Math.min(minCum, cum);
  }

  let terminal: TerminalAssets | null = null;
  if (opts.terminal) {
    const value = grown(opts.terminal.value, H, p.priceGrowthAnnual);
    const disposalCost = transactionCost(value, opts.terminal.kind, p.transaction);
    const tax = taxOrPending(ctx, opts.terminal.taxPref);
    const loan = loanAmount(ctx);
    const net = value - disposalCost - (tax ?? 0) - loan - opts.terminal.deposit;
    terminal = {
      propertyValue: value,
      disposalCost,
      tax,
      loan,
      deposit: opts.terminal.deposit,
      net,
      pv: presentValue(net, H, p.discountRateAnnual),
    };
  }

  let saleSettlement: SaleSettlement | null = null;
  if (opts.saleInfo && opts.saleMonth !== null) {
    const holdingAndFinanceSum = ctx.flows
      .filter((f) => f.month <= opts.saleMonth! && ["holding", "finance", "maintenance"].includes(f.category))
      .reduce((a, f) => a - f.amount, 0);
    const deposit = opts.saleInfo.deposit + opts.priorDeposit;
    saleSettlement = {
      month: opts.saleMonth,
      price: opts.saleInfo.sale,
      transaction: opts.saleInfo.fee,
      tax: opts.saleInfo.tax,
      loan: opts.saleInfo.loan,
      deposit,
      executionCost: opts.executionCost,
      holdingAndFinance: holdingAndFinanceSum,
      netProceeds:
        opts.saleInfo.sale -
        opts.executionCost -
        holdingAndFinanceSum -
        opts.saleInfo.fee -
        (opts.saleInfo.tax ?? 0) -
        opts.saleInfo.loan -
        deposit,
    };
  }

  return {
    option,
    computable: true,
    missing: [],
    pending: [...ctx.pending],
    flows: ctx.flows,
    netCash,
    pvCash,
    terminal,
    comparisonValue: pvCash + (terminal?.pv ?? 0),
    saleSettlement,
    completionMonth: opts.completionMonth,
    executionCost: opts.executionCost,
    maxUpfront: Math.max(0, -minCum),
    monthlyNet,
  };
}

function spread(ctx: Ctx, fromMonth: number, months: number, total: number, label: string) {
  const n = Math.max(1, months);
  const start = months <= 0 ? fromMonth : fromMonth + 1;
  for (let i = 0; i < n; i++) add(ctx, start + i, -total / n, "execution", label);
}

export function simulate(option: SimOptionId, p: ScalarParams): SimResult {
  const ctx: Ctx = { p, flows: [], pending: new Set() };
  const H = p.horizonMonths;
  if (p.occupancy === "unknown") ctx.pending.add("사용 상황 미확인(공실로 가정)");

  switch (option) {
    case "sell_as_is": {
      if (p.asIsPrice === null) return EMPTY(option, ["현상태 매각가 추정 근거 부족(유사 거래 사례 부족)"]);
      const s = Math.round(p.saleLeadAsIs);
      if (s > H) return EMPTY(option, [`예상 매각 시점(${s}개월)이 비교 기간(${H}개월)을 넘음`]);
      holdingAndFinance(ctx, 1, s);
      maintenance(ctx, 1, s, p.maintenanceAsIsMonthly, "현 건물 유지관리비(가정)");
      rentIncome(ctx, 1, s, tenantRent(ctx), "기존 임대료");
      const info = sell(ctx, s, p.asIsPrice, "asIsSale", p.taxAsIsSale, true);
      replacementHousing(ctx, s + 1, H, "매각 후 대체 주거비");
      return finish(option, ctx, { completionMonth: s, executionCost: 0, saleInfo: info, saleMonth: s, priorDeposit: 0, terminal: null });
    }

    case "demolish_sell_land": {
      const missing: string[] = [];
      if (p.landPrice === null) missing.push("철거 후 토지 매각가 근거 부족(토지 거래 사례 또는 전문가 의견 필요)");
      if (p.demolitionCost === null) missing.push("철거비 추정 불가(연면적 정보 없음)");
      if (missing.length) return EMPTY(option, missing);
      const s0 = vacateMonth(ctx);
      const workStart = s0 + Math.round(p.demolitionPrepMonths);
      const workEnd = workStart + Math.round(p.demolitionWorkMonths);
      const saleMonth = workEnd + Math.round(p.saleLeadLand);
      if (saleMonth > H) return EMPTY(option, [`예상 매각 시점(${saleMonth}개월)이 비교 기간(${H}개월)을 넘음`], [...ctx.pending]);
      rentIncome(ctx, 1, s0, tenantRent(ctx), "기존 임대료(계약 종료까지)");
      const deposit = depositAmount(ctx);
      add(ctx, s0, -deposit, "deposit", "임차보증금 반환(명도)");
      holdingAndFinance(ctx, 1, saleMonth);
      maintenance(ctx, 1, workStart, p.maintenanceAsIsMonthly, "현 건물 유지관리비(가정)");
      spread(ctx, workStart, Math.round(p.demolitionWorkMonths), p.demolitionCost!, "철거 실행비용(공사·폐기물·부대·예비비)");
      replacementHousing(ctx, workStart + 1, H, "철거 이후 대체 주거비");
      const info = sell(ctx, saleMonth, p.landPrice!, "landSale", p.taxLandSale, false);
      return finish(option, ctx, {
        completionMonth: saleMonth,
        executionCost: p.demolitionCost!,
        saleInfo: info,
        saleMonth,
        priorDeposit: deposit,
        terminal: null,
      });
    }

    case "remodel_sell":
    case "remodel_rent":
    case "remodel_live": {
      const missing: string[] = [];
      if (p.remodelCost === null) missing.push("리모델링 비용 추정 불가(연면적 정보 없음)");
      if (p.remodelPrice === null)
        missing.push("리모델링 후 가치 근거 없음 — '계산 조건 수정'에서 가정값을 입력해야 계산됩니다");
      if (option === "remodel_rent" && p.remodelRentMonthly === null)
        missing.push("리모델링 후 예상 월 임대료 미입력");
      if (missing.length) return EMPTY(option, missing);
      const s0 = vacateMonth(ctx);
      const workStart = s0 + Math.round(p.remodelPrepMonths);
      const workEnd = workStart + Math.round(p.remodelWorkMonths);
      rentIncome(ctx, 1, s0, tenantRent(ctx), "기존 임대료(계약 종료까지)");
      const deposit = depositAmount(ctx);
      add(ctx, s0, -deposit, "deposit", "임차보증금 반환(명도)");
      maintenance(ctx, 1, workStart, p.maintenanceAsIsMonthly, "현 건물 유지관리비(가정)");
      spread(ctx, workStart, Math.round(p.remodelWorkMonths), p.remodelCost!, "리모델링 실행비용(공사·폐기물·부대·예비비)");

      if (option === "remodel_sell") {
        const saleMonth = workEnd + Math.round(p.saleLeadRemodeled);
        if (saleMonth > H) return EMPTY(option, [`예상 매각 시점(${saleMonth}개월)이 비교 기간(${H}개월)을 넘음`], [...ctx.pending]);
        holdingAndFinance(ctx, 1, saleMonth);
        maintenance(ctx, workEnd + 1, saleMonth, p.remodelMaintenanceMonthly, "리모델링 후 유지관리비(가정)");
        // 본인 거주였다면 공사 시작부터 기간 말까지 나가 있다(공사 중 임시거주 + 매각 후 대체 주거)
        replacementHousing(ctx, workStart + 1, H, "공사 중 임시거주·매각 후 대체 주거비");
        const info = sell(ctx, saleMonth, p.remodelPrice!, "remodelSale", p.taxRemodelSale, false);
        return finish(option, ctx, {
          completionMonth: saleMonth,
          executionCost: p.remodelCost!,
          saleInfo: info,
          saleMonth,
          priorDeposit: deposit,
          terminal: null,
        });
      }

      if (workEnd > H) return EMPTY(option, [`공사 완료 시점(${workEnd}개월)이 비교 기간(${H}개월)을 넘음`], [...ctx.pending]);
      holdingAndFinance(ctx, 1, H);
      maintenance(ctx, workEnd + 1, H, p.remodelMaintenanceMonthly, "리모델링 후 유지관리비(가정)");
      if (option === "remodel_rent") {
        rentIncome(ctx, workEnd + 1, H, p.remodelRentMonthly! * (1 - p.remodelVacancyRate), "리모델링 후 임대료(공실률 반영)");
        ctx.pending.add("신규 임차인 보증금 미반영(월세 기준 계산)");
        replacementHousing(ctx, workStart + 1, H, "공사 중 임시거주·이후 대체 주거비");
      } else {
        replacementHousing(ctx, workStart + 1, workEnd, "공사 중 임시거주비");
      }
      return finish(option, ctx, {
        completionMonth: workEnd,
        executionCost: p.remodelCost!,
        saleInfo: null,
        saleMonth: null,
        priorDeposit: deposit,
        terminal: { value: p.remodelPrice!, taxPref: p.taxRemodelSale, kind: "remodelSale", deposit: 0 },
      });
    }

    case "keep": {
      if (p.asIsPrice === null) return EMPTY(option, ["보유 부동산 가치 추정 근거 부족(유사 거래 사례 부족)"]);
      holdingAndFinance(ctx, 1, H);
      maintenance(ctx, 1, H, p.maintenanceAsIsMonthly, "현 건물 유지관리비(가정)");
      if (p.occupancy === "tenant") {
        rentIncome(ctx, 1, H, tenantRent(ctx), "기존 임대료(같은 조건 갱신 가정)");
      }
      const deposit = depositAmount(ctx);
      return finish(option, ctx, {
        completionMonth: 0,
        executionCost: 0,
        saleInfo: null,
        saleMonth: null,
        priorDeposit: 0,
        terminal: { value: p.asIsPrice, taxPref: p.taxAsIsSale, kind: "asIsSale", deposit },
      });
    }
  }
}
