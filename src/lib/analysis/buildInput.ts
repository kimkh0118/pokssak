// 조회 결과 + 질문 답 + 계산 조건 수정값 → 계산 엔진 입력.
// 모든 값에 출처 구분(공공데이터/사용자 입력/추정/예시)을 붙여 화면에 보여줄 수 있게 한다.

import type { Answers, DataPoint, Provenance, Range } from "../domain/types";
import { isKnown } from "../domain/types";
import type { BuildingRecord, PropertyLookup } from "../domain/property";
import { formatArea, formatWon } from "../domain/units";
import type { EngineInput } from "../engine/analyze";
import { BROKERAGE_RULE_SOURCE } from "../engine/fees";
import { estimateFromHouseComps, estimateFromLandComps, type CompEstimate } from "../estimation/comps";
import {
  COST_ASSUMPTION_AS_OF,
  COST_ASSUMPTION_SOURCE,
  estimateDemolition,
  estimateRemodel,
  MAINTENANCE_BY_CONDITION,
  remodelScopeFor,
  type CostEstimate,
} from "../estimation/costs";
import { SAMPLE_REMODEL_ASSUMPTIONS } from "../providers/sample";

export interface Overrides {
  horizonMonths?: number;
  discountRatePct?: number;
  priceGrowthPct?: number;
  asIsPrice?: Range | null;
  landPrice?: Range | null;
  remodelPrice?: Range | null;
  remodelRentMonthly?: Range | null;
  demolitionCost?: Range | null;
  remodelCost?: Range | null;
  remodelScope?: "partial" | "full";
  replacementHousingMonthly?: number | null;
  holdingCostMonthly?: number;
  maintenanceAsIsMonthly?: number;
  remodelVacancyPct?: number;
  remodelMaintenanceMonthly?: number;
  taxes?: { asIsSale?: number | null; landSale?: number | null; remodelSale?: number | null };
  transactionExtraFixed?: number;
  demolitionWorkMonths?: Range;
  remodelWorkMonths?: Range;
  saleLeadAsIs?: Range;
  saleLeadLand?: Range;
  saleLeadRemodeled?: Range;
}

export interface Target {
  buildingPk: string | "all" | null;
  scopeConfirmedByUser?: boolean;
}

export interface Assumption {
  key: string;
  group: "기본 정보" | "가격" | "비용" | "기간" | "자금·임대차" | "비교 기준";
  label: string;
  display: string;
  provenance: Provenance;
  source: string;
  asOf?: string | null;
  fetchedAt?: string | null;
  unit?: string;
  note?: string;
}

export interface BuiltInput {
  engineInput: EngineInput;
  facts: (DataPoint<string | number> & { key: string; label: string })[];
  assumptions: Assumption[];
  comps: CompEstimate;
  landComps: CompEstimate;
  demolition: CostEstimate;
  remodel: CostEstimate;
  subject: { landArea: number | null; floorArea: number | null; buildYear: number | null; building: BuildingRecord | null };
}

const R = (low: number, base: number, high: number): Range => ({ low, base, high });
const rangeText = (r: Range | null, f: (n: number) => string = (n) => formatWon(n)) =>
  r ? `${f(r.base)} (범위 ${f(r.low)} ~ ${f(r.high)})` : "산정 보류";
const monthsText = (r: Range) => `${r.base}개월 (${r.low}~${r.high}개월)`;

export function monthsUntil(yyyymm: string, now = new Date()): number | null {
  const m = /^(\d{4})-?(\d{2})$/.exec(yyyymm);
  if (!m) return null;
  const diff = (Number(m[1]) - now.getFullYear()) * 12 + (Number(m[2]) - (now.getMonth() + 1));
  return Math.max(0, diff);
}

export function pickBuilding(lookup: PropertyLookup, target: Target): BuildingRecord | null {
  const main = lookup.mainBuildings;
  if (main.length === 0) return null;
  if (target.buildingPk === "all") {
    const sum = (k: "totArea") => main.reduce((a, b) => a + (b[k] ?? 0), 0);
    const oldest = [...main].sort((a, b) => (a.useAprDay ?? "9").localeCompare(b.useAprDay ?? "9"))[0];
    return { ...main[0], totArea: sum("totArea"), dongNm: "전체 주건축물 합계", useAprDay: oldest.useAprDay };
  }
  return main.find((b) => b.mgmBldrgstPk === target.buildingPk) ?? main[0];
}

export function buildInput(lookup: PropertyLookup, answers: Answers, target: Target, ov: Overrides = {}): BuiltInput {
  const isSample = lookup.mode === "sample";
  const pubProv: Provenance = isSample ? "sample" : "public_api";
  const estProv: Provenance = isSample ? "sample" : "estimate";
  const building = pickBuilding(lookup, target);
  const land = lookup.land.ok ? lookup.land.data : null;
  const landMeta = lookup.land.ok ? lookup.land.meta : null;
  const bMeta = lookup.buildings.ok ? lookup.buildings.meta : null;

  const landArea = land?.lndpclAr ?? building?.platArea ?? null;
  const landAreaSource = land?.lndpclAr ? landMeta?.source : building?.platArea ? `${bMeta?.source} 대지면적` : "정보 없음";
  const floorArea = building?.totArea ?? null;
  const buildYear = building?.useAprDay ? Number(building.useAprDay.slice(0, 4)) || null : null;

  // ---- 기본 정보(출처 포함)
  const facts: BuiltInput["facts"] = [];
  const fact = (key: string, label: string, value: string | number | null, provenance: Provenance, source: string, extra: Partial<DataPoint<unknown>> = {}) =>
    facts.push({ key, label, value, provenance, source, ...extra } as BuiltInput["facts"][number]);
  const aProv = lookup.address.provenance;
  fact("roadAddr", "도로명주소", lookup.address.roadAddr, aProv, isSample ? "예시 데이터" : "도로명주소 검색 API");
  fact("jibunAddr", "지번주소", lookup.address.jibunAddr, aProv, isSample ? "예시 데이터" : "도로명주소 검색 API");
  fact("admCd", "법정동코드", lookup.address.admCd, aProv, isSample ? "예시 데이터" : "도로명주소 검색 API(admCd)");
  fact("pnu", "필지고유번호(PNU)", lookup.parcel?.pnu ?? null, "estimate", "법정동코드+대지구분+본번+부번으로 조합", { note: "조합 규칙으로 만든 식별자" });
  if (land) {
    const lp = { asOf: landMeta?.asOf, fetchedAt: landMeta?.fetchedAt };
    fact("lndpclAr", "토지 면적", land.lndpclAr, pubProv, landMeta!.source, { unit: "㎡", ...lp });
    fact("lndcgr", "지목", land.lndcgrCodeNm, pubProv, landMeta!.source, lp);
    fact("prposArea", "용도지역", [land.prposArea1Nm, land.prposArea2Nm && land.prposArea2Nm !== "지정되지않음" ? land.prposArea2Nm : null].filter(Boolean).join(", ") || null, pubProv, landMeta!.source, lp);
    fact("pblntfPclnd", `공시지가(${land.stdrYear ?? "기준연도 미상"}년)`, land.pblntfPclnd, pubProv, landMeta!.source, { unit: "원/㎡", note: "공시지가는 시장 매각가가 아니므로 매각가 계산에 쓰지 않습니다.", ...lp });
  }
  if (building) {
    const bp = { asOf: bMeta?.asOf, fetchedAt: bMeta?.fetchedAt };
    fact("mainPurps", "건축물 용도", building.mainPurpsCdNm, pubProv, bMeta!.source, bp);
    fact("strct", "구조", building.strctCdNm, pubProv, bMeta!.source, bp);
    fact("totArea", "연면적", building.totArea, pubProv, bMeta!.source, { unit: "㎡", ...bp });
    fact("flr", "층수", building.grndFlrCnt !== null ? `지상 ${building.grndFlrCnt}층${building.ugrndFlrCnt ? ` / 지하 ${building.ugrndFlrCnt}층` : ""}` : null, pubProv, bMeta!.source, bp);
    fact("useAprDay", "사용승인일", building.useAprDay, pubProv, bMeta!.source, bp);
  }

  // ---- 가격 추정
  const subject = { landArea, floorArea, buildYear, umdNm: lookup.address.emdNm || null };
  const comps = estimateFromHouseComps(subject, lookup.trades.ok ? lookup.trades.data : []);
  if (!lookup.trades.ok) comps.withheldReason = `거래 사례 조회 실패: ${lookup.trades.error.message}`;
  const landComps = estimateFromLandComps(subject, lookup.landTrades && lookup.landTrades.ok ? lookup.landTrades.data : null);

  const scope = ov.remodelScope ?? remodelScopeFor(answers.condition);
  const demolition = estimateDemolition(floorArea);
  const remodel = estimateRemodel(floorArea, scope);

  const sampleAssump = isSample ? SAMPLE_REMODEL_ASSUMPTIONS[lookup.address.id] : undefined;

  const pick = <T,>(o: T | undefined, d: T): [T, boolean] => (o !== undefined ? [o, true] : [d, false]);
  const [asIsPrice, asIsUser] = pick(ov.asIsPrice, comps.range);
  const [landPrice, landUser] = pick(ov.landPrice, landComps.range);
  const [remodelPrice, remodelUser] = pick(ov.remodelPrice, sampleAssump?.remodelPrice ?? null);
  const [remodelRent, remodelRentUser] = pick(ov.remodelRentMonthly, sampleAssump?.remodelRentMonthly ?? null);
  const [demoCost, demoUser] = pick(ov.demolitionCost, demolition.total);
  const [remCost, remUser] = pick(ov.remodelCost, remodel.total);

  // ---- 사용자 답변
  const t = answers.tenant;
  const tenantDeposit = answers.occupancy === "tenant" && t && isKnown(t.deposit) ? t.deposit.won : null;
  const tenantRent = answers.occupancy === "tenant" && t && isKnown(t.monthlyRent) ? t.monthlyRent.won : null;
  const leaseEnd = answers.occupancy === "tenant" && t?.leaseEnd.status === "known" ? monthsUntil(t.leaseEnd.yyyymm) : null;
  const loan = isKnown(answers.loanBalance) ? answers.loanBalance.won : null;
  const loanRate = answers.loanRatePct.status === "known" ? answers.loanRatePct.pct / 100 : loan === 0 ? 0 : null;
  const cash = isKnown(answers.availableCash) ? answers.availableCash.won : null;

  const horizon = ov.horizonMonths ?? 36;
  const disc = (ov.discountRatePct ?? 3.5) / 100;
  const growth = (ov.priceGrowthPct ?? 0) / 100;
  const maint = ov.maintenanceAsIsMonthly ?? MAINTENANCE_BY_CONDITION[answers.condition];
  const holding = ov.holdingCostMonthly ?? 100_000;
  const vacancy = (ov.remodelVacancyPct ?? 5) / 100;
  const remMaint = ov.remodelMaintenanceMonthly ?? 100_000;
  const replacement = ov.replacementHousingMonthly !== undefined ? ov.replacementHousingMonthly : null;
  const durations = {
    demolitionPrep: R(1, 2, 4),
    demolitionWork: ov.demolitionWorkMonths ?? R(1, 1, 2),
    remodelPrep: R(1, 2, 3),
    remodelWork: ov.remodelWorkMonths ?? (scope === "full" ? R(3, 5, 7) : R(2, 3, 4)),
    asIs: ov.saleLeadAsIs ?? R(2, 4, 7),
    land: ov.saleLeadLand ?? R(3, 5, 9),
    remodeled: ov.saleLeadRemodeled ?? R(2, 4, 7),
  };
  const taxes = {
    asIsSale: ov.taxes?.asIsSale ?? null,
    landSale: ov.taxes?.landSale ?? null,
    remodelSale: ov.taxes?.remodelSale ?? null,
  };

  const engineInput: EngineInput = {
    horizonMonths: horizon,
    discountRateAnnual: disc,
    priceGrowthAnnual: growth,
    purpose: answers.purpose,
    timing: answers.timing,
    occupancy: answers.occupancy,
    availableCash: cash,
    loanBalance: loan,
    loanRateAnnual: loanRate,
    tenantDeposit,
    tenantMonthlyRent: tenantRent,
    tenantLeaseEndMonth: leaseEnd,
    replacementHousingMonthly: replacement,
    holdingCostMonthly: holding,
    maintenanceAsIsMonthly: maint,
    asIsPrice,
    landPrice,
    remodelPrice,
    remodelRentMonthly: remodelRent,
    remodelVacancyRate: vacancy,
    remodelMaintenanceMonthly: remMaint,
    demolitionCost: demoCost,
    demolitionPrepMonths: durations.demolitionPrep,
    demolitionWorkMonths: durations.demolitionWork,
    remodelCost: remCost,
    remodelPrepMonths: durations.remodelPrep,
    remodelWorkMonths: durations.remodelWork,
    saleLeadMonths: { asIs: durations.asIs, land: durations.land, remodeled: durations.remodeled },
    transaction: { extraFixed: ov.transactionExtraFixed ?? 0, override: { asIsSale: null, landSale: null, remodelSale: null } },
    taxes,
    context: { condition: answers.condition, isOld: buildYear !== null && buildYear < 1990 },
  };

  // ---- 가정·출처 목록
  const A: Assumption[] = [];
  const add = (a: Assumption) => A.push(a);
  const userOr = (user: boolean, p: Provenance) => (user ? "user_input" : p);
  add({ key: "landArea", group: "기본 정보", label: "분석에 쓴 토지 면적", display: formatArea(landArea), provenance: landArea ? pubProv : "estimate", source: landAreaSource ?? "정보 없음", unit: "㎡" });
  add({ key: "floorArea", group: "기본 정보", label: "분석에 쓴 연면적", display: formatArea(floorArea), provenance: floorArea ? pubProv : "estimate", source: bMeta?.source ?? "정보 없음", note: building?.dongNm ?? undefined, unit: "㎡" });
  add({
    key: "asIsPrice",
    group: "가격",
    label: "현상태 매각가",
    display: rangeText(asIsPrice),
    provenance: userOr(asIsUser, estProv),
    source: asIsUser ? "계산 조건 수정에서 직접 입력" : comps.range ? `유사 거래 ${comps.sampleSize}건(${comps.basis === "same_dong" ? "같은 법정동" : "시군구 전체"}) 대지㎡당 가격 분위수` : comps.withheldReason ?? "산정 보류",
    asOf: lookup.trades.ok ? lookup.trades.meta.asOf : null,
    fetchedAt: lookup.trades.ok ? lookup.trades.meta.fetchedAt : null,
  });
  add({
    key: "landPrice",
    group: "가격",
    label: "철거 후 토지 매각가",
    display: rangeText(landPrice),
    provenance: userOr(landUser, estProv),
    source: landUser ? "계산 조건 수정에서 직접 입력(전문가 의견 등)" : landComps.range ? `토지 거래 ${landComps.sampleSize}건 ㎡당 가격 분위수` : landComps.withheldReason ?? "산정 보류",
    note: "기존 주택 가격에 상승률을 곱해 만들지 않습니다.",
  });
  add({
    key: "remodelPrice",
    group: "가격",
    label: "리모델링 후 가치",
    display: rangeText(remodelPrice),
    provenance: remodelUser ? "user_input" : sampleAssump ? "sample" : "estimate",
    source: remodelUser ? "계산 조건 수정에서 직접 입력" : sampleAssump ? "예시 가정값" : "근거 없음 — 직접 입력 필요",
    note: "공사비만큼 집값이 오른다고 가정하지 않습니다.",
  });
  add({
    key: "remodelRent",
    group: "가격",
    label: "리모델링 후 월 임대료",
    display: rangeText(remodelRent),
    provenance: remodelRentUser ? "user_input" : sampleAssump ? "sample" : "estimate",
    source: remodelRentUser ? "계산 조건 수정에서 직접 입력" : sampleAssump ? "예시 가정값" : "근거 없음 — 직접 입력 필요",
  });
  add({ key: "demolitionCost", group: "비용", label: "철거 실행비용 합계", display: rangeText(demoCost), provenance: userOr(demoUser, estProv), source: demoUser ? "견적 등 직접 입력" : demolition.total ? COST_ASSUMPTION_SOURCE : demolition.withheldReason ?? "", asOf: demoUser ? null : COST_ASSUMPTION_AS_OF });
  add({ key: "remodelCost", group: "비용", label: `리모델링 실행비용 합계(${scope === "full" ? "전면" : "부분"})`, display: rangeText(remCost), provenance: userOr(remUser, estProv), source: remUser ? "견적 등 직접 입력" : remodel.total ? COST_ASSUMPTION_SOURCE : remodel.withheldReason ?? "", asOf: remUser ? null : COST_ASSUMPTION_AS_OF });
  add({ key: "transaction", group: "비용", label: "중개·거래비용", display: `중개보수 상한 + 기타 ${formatWon(engineInput.transaction.extraFixed)}`, provenance: "estimate", source: BROKERAGE_RULE_SOURCE });
  add({ key: "holding", group: "비용", label: "월 보유비(보유세 제외)", display: formatWon(holding), provenance: ov.holdingCostMonthly !== undefined ? "user_input" : "estimate", source: "서비스 기본 가정값" });
  add({ key: "maintenance", group: "비용", label: "현 건물 월 유지관리비", display: formatWon(maint), provenance: ov.maintenanceAsIsMonthly !== undefined ? "user_input" : "estimate", source: "집 상태 답변에 따른 기본 가정값(전문 진단 아님)" });
  add({ key: "taxes", group: "비용", label: "세금", display: [taxes.asIsSale, taxes.landSale, taxes.remodelSale].every((x) => x === null) ? "세금 반영 전" : `현상태 ${formatWon(taxes.asIsSale)} / 토지 ${formatWon(taxes.landSale)} / 리모델링 후 ${formatWon(taxes.remodelSale)}`, provenance: ov.taxes ? "user_input" : "estimate", source: "개인별 세금은 검증된 계산 규칙이 없어 자동 산정하지 않음(직접 입력 시 반영)" });
  add({ key: "replacement", group: "자금·임대차", label: "월 대체·임시 주거비", display: replacement === null ? "미입력" : formatWon(replacement), provenance: replacement === null ? "estimate" : "user_input", source: answers.occupancy === "owner" ? "본인 거주 시 필요(계산 조건 수정에서 입력)" : "본인 거주가 아니면 사용하지 않음" });
  const missingText = (st: string) => (st === "unknown" ? "모름" : "미입력");
  add({ key: "loan", group: "자금·임대차", label: "대출 잔액 / 금리", display: `${loan === null ? missingText(answers.loanBalance.status) : formatWon(loan)} / ${loanRate === null ? missingText(answers.loanRatePct.status) : `${(loanRate * 100).toFixed(2)}%`}`, provenance: loan === null ? "estimate" : "user_input", source: "계산 조건 수정의 자금·대출 입력(미입력 시 대출 반영 전으로 표시)" });
  add({ key: "cash", group: "자금·임대차", label: "추가 투입 가능 현금", display: cash === null ? missingText(answers.availableCash.status) : formatWon(cash), provenance: cash === null ? "estimate" : "user_input", source: "계산 조건 수정의 자금·대출 입력(미입력 시 예산 판단 보류)" });
  if (answers.occupancy === "tenant")
    add({ key: "tenant", group: "자금·임대차", label: "임차보증금 / 월세 / 종료", display: `${tenantDeposit === null ? "모름" : formatWon(tenantDeposit)} / ${tenantRent === null ? "모름" : formatWon(tenantRent)} / ${leaseEnd === null ? "모름" : `${leaseEnd}개월 후`}`, provenance: "user_input", source: "질문 2 답변" });
  add({ key: "durations", group: "기간", label: "매각 소요(현상태/토지/리모델링 후)", display: `${monthsText(durations.asIs)} / ${monthsText(durations.land)} / ${monthsText(durations.remodeled)}`, provenance: "estimate", source: "서비스 기본 가정값" });
  add({ key: "works", group: "기간", label: "공사 기간(철거/리모델링)", display: `준비 ${monthsText(durations.demolitionPrep)} + 공사 ${monthsText(durations.demolitionWork)} / 준비 ${monthsText(durations.remodelPrep)} + 공사 ${monthsText(durations.remodelWork)}`, provenance: "estimate", source: "서비스 기본 가정값(인허가 일정에 따라 달라짐)" });
  add({ key: "horizon", group: "비교 기준", label: "공통 비교 기간 H", display: `${horizon}개월`, provenance: ov.horizonMonths !== undefined ? "user_input" : "estimate", source: "기본 가정(수정 가능)" });
  add({ key: "discount", group: "비교 기준", label: "연 할인율 r", display: `${(disc * 100).toFixed(1)}%`, provenance: ov.discountRatePct !== undefined ? "user_input" : "estimate", source: "기본 가정(수정 가능)" });
  add({ key: "growth", group: "비교 기준", label: "연 가격변동률", display: `${(growth * 100).toFixed(1)}%`, provenance: ov.priceGrowthPct !== undefined ? "user_input" : "estimate", source: "기본 가정(수정 가능, 모든 선택지에 동일 적용)" });

  return { engineInput, facts, assumptions: A, comps, landComps, demolition, remodel, subject: { landArea, floorArea, buildYear, building } };
}
