// 유사 거래 사례 선정과 가격 추정.
// - 실거래가 API는 시군구·계약년월 단위 자료이고 지번이 일부만 공개된다. 대상 주소의 거래 이력으로 연결하지 않는다.
// - 선정·제외 기준을 기록해 화면에서 설명할 수 있게 한다.
// - 표본이 부족하면 산정을 보류한다(억지로 숫자를 만들지 않음).

import type { Range } from "../domain/types";
import type { TradeRecord } from "../domain/property";

export interface CompSubject {
  landArea: number | null;
  floorArea: number | null;
  buildYear: number | null;
  umdNm: string | null;
}

export interface CompDecision {
  trade: TradeRecord;
  included: boolean;
  reason: string; // 제외 사유 또는 포함 메모
  pricePerLandSqm: number | null;
}

export interface CompEstimate {
  range: Range | null;
  basis: "same_dong" | "district" | null;
  sampleSize: number;
  pricePerLandSqm: Range | null;
  decisions: CompDecision[];
  criteria: string[];
  withheldReason: string | null;
}

export const MIN_COMPS = 3;
const LAND_RATIO_MIN = 0.5;
const LAND_RATIO_MAX = 2;
const BUILD_YEAR_GAP = 15;

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 현상태(건물 포함) 매각가 추정: 대지면적당 거래가의 25·50·75% 분위수 × 대상 대지면적.
 * 단독·다가구는 대지 가치 비중이 커서 대지면적당 가격을 기준으로 삼고, 연면적·노후도는 필터로 반영한다.
 */
export function estimateFromHouseComps(subject: CompSubject, trades: TradeRecord[]): CompEstimate {
  const criteria = [
    "같은 시군구의 단독·다가구 매매 신고 자료(최근 12개월)",
    "해제(취소)된 거래 제외",
    "직거래 제외(시장 가격과 다를 가능성)",
    `대지면적이 대상의 ${LAND_RATIO_MIN}~${LAND_RATIO_MAX}배 범위`,
    `연면적이 대상의 ${LAND_RATIO_MIN}~${LAND_RATIO_MAX}배 범위(양쪽 정보가 있을 때)`,
    `건축년도 차이 ${BUILD_YEAR_GAP}년 이내(양쪽 정보가 있을 때)`,
    `같은 법정동 사례가 ${MIN_COMPS}건 이상이면 같은 동만 사용, 아니면 시군구 전체`,
    "대지면적당 가격의 25%·50%·75% 분위수 × 대상 대지면적",
  ];
  if (!subject.landArea) {
    return { range: null, basis: null, sampleSize: 0, pricePerLandSqm: null, decisions: [], criteria, withheldReason: "대상 토지 면적 정보가 없어 비교할 수 없습니다." };
  }
  const decisions: CompDecision[] = trades.map((t) => {
    const ppsm = t.amountWon && t.landArea ? t.amountWon / t.landArea : null;
    const d = (included: boolean, reason: string): CompDecision => ({ trade: t, included, reason, pricePerLandSqm: ppsm });
    if (t.cancelled) return d(false, "해제된 거래");
    if (t.dealingGbn && t.dealingGbn.includes("직거래")) return d(false, "직거래");
    if (!t.amountWon) return d(false, "거래금액 없음");
    if (!t.landArea) return d(false, "대지면적 없음");
    const ratio = t.landArea / subject.landArea!;
    if (ratio < LAND_RATIO_MIN || ratio > LAND_RATIO_MAX) return d(false, `대지면적 차이 큼(${ratio.toFixed(2)}배)`);
    if (subject.floorArea && t.floorArea) {
      const fr = t.floorArea / subject.floorArea;
      if (fr < LAND_RATIO_MIN || fr > LAND_RATIO_MAX) return d(false, `연면적 차이 큼(${fr.toFixed(2)}배)`);
    }
    if (subject.buildYear && t.buildYear && Math.abs(subject.buildYear - t.buildYear) > BUILD_YEAR_GAP)
      return d(false, `건축년도 차이 ${Math.abs(subject.buildYear - t.buildYear)}년`);
    return d(true, "기준 충족");
  });

  let pool = decisions.filter((x) => x.included);
  let basis: CompEstimate["basis"] = "district";
  const same = pool.filter((x) => subject.umdNm && x.trade.umdNm === subject.umdNm);
  if (same.length >= MIN_COMPS) {
    basis = "same_dong";
    for (const x of pool) if (!same.includes(x)) { x.included = false; x.reason = "같은 동 사례가 충분해 제외"; }
    pool = same;
  }
  if (pool.length < MIN_COMPS) {
    return {
      range: null,
      basis: null,
      sampleSize: pool.length,
      pricePerLandSqm: null,
      decisions,
      criteria,
      withheldReason: `기준을 충족하는 사례가 ${pool.length}건으로 ${MIN_COMPS}건 미만이라 산정을 보류합니다.`,
    };
  }
  const per = pool.map((x) => x.pricePerLandSqm!).sort((a, b) => a - b);
  const ppsm = { low: quantile(per, 0.25), base: quantile(per, 0.5), high: quantile(per, 0.75) };
  const area = subject.landArea!;
  return {
    range: { low: Math.round(ppsm.low * area), base: Math.round(ppsm.base * area), high: Math.round(ppsm.high * area) },
    basis,
    sampleSize: pool.length,
    pricePerLandSqm: ppsm,
    decisions,
    criteria,
    withheldReason: null,
  };
}

/** 철거 후 토지 매각가: 토지 거래 사례로만 추정한다. 주택 가격에 상승률을 곱하지 않는다. */
export function estimateFromLandComps(subject: CompSubject, trades: TradeRecord[] | null): CompEstimate {
  const criteria = [
    "같은 시군구의 토지 매매 사례(지목 '대')",
    "해제된 거래·직거래 제외",
    `거래면적이 대상의 ${LAND_RATIO_MIN}~${LAND_RATIO_MAX}배 범위`,
    "㎡당 가격의 25%·50%·75% 분위수 × 대상 토지 면적",
  ];
  if (!trades) {
    return {
      range: null,
      basis: null,
      sampleSize: 0,
      pricePerLandSqm: null,
      decisions: [],
      criteria,
      withheldReason: "토지 거래 사례 자료가 연동되지 않았습니다. 전문가 의견이나 직접 확인한 토지 시세를 입력하면 계산합니다.",
    };
  }
  const r = estimateFromHouseComps({ ...subject, buildYear: null, floorArea: null }, trades.filter((t) => !t.landUse || t.landUse.includes("대")));
  return { ...r, criteria };
}
