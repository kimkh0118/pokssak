// 중개보수 상한 계산. 「공인중개사법 시행규칙」 별표 1(2021.10.19 시행) 주택 매매·교환 상한요율 기준.
// 실제 보수는 상한 이내에서 협의로 정해지고, 부가가치세는 별도다. 따라서 이 값은 "상한 기준 추정"이다.

export const BROKERAGE_RULE_SOURCE =
  "공인중개사법 시행규칙 별표1 주택 매매 중개보수 상한요율(2021.10.19 시행), 주택 외(토지) 상한 0.9% — 상한 기준 추정, 부가세 별도";

interface Bracket {
  below: number; // 이 금액 미만에 적용
  rate: number;
  cap?: number; // 한도액
}

const HOUSING_BRACKETS: Bracket[] = [
  { below: 50_000_000, rate: 0.006, cap: 250_000 },
  { below: 200_000_000, rate: 0.005, cap: 800_000 },
  { below: 900_000_000, rate: 0.004 },
  { below: 1_200_000_000, rate: 0.005 },
  { below: 1_500_000_000, rate: 0.006 },
  { below: Infinity, rate: 0.007 },
];

/** 주택 매매 중개보수 상한(원) */
export function housingBrokerageCap(price: number): number {
  if (!(price > 0)) return 0;
  const b = HOUSING_BRACKETS.find((x) => price < x.below)!;
  const fee = price * b.rate;
  return Math.round(b.cap !== undefined ? Math.min(fee, b.cap) : fee);
}

/** 주택 외(토지 등) 중개보수 상한(원): 0.9% 이내 협의 */
export function landBrokerageCap(price: number): number {
  if (!(price > 0)) return 0;
  return Math.round(price * 0.009);
}

export type PropertyKindForFee = "housing" | "land";

/**
 * 거래비용 설정
 * - 기본: 법정 상한 요율로 중개보수를 추정하고 extraFixed(법무·서류 등 기타 거래비)를 더한다.
 * - override 값이 있으면 그 매각 건의 거래비용으로 그대로 쓴다(사용자 입력 고정값).
 */
export interface TransactionCostSetting {
  extraFixed: number;
  override: { asIsSale: number | null; landSale: number | null; remodelSale: number | null };
}

export type SaleKind = "asIsSale" | "landSale" | "remodelSale";

export function transactionCost(price: number, saleKind: SaleKind, setting: TransactionCostSetting): number {
  const o = setting.override[saleKind];
  if (o !== null && o !== undefined) return o;
  const fee = saleKind === "landSale" ? landBrokerageCap(price) : housingBrokerageCap(price);
  return fee + setting.extraFixed;
}
