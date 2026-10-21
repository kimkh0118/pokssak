// 예시 데이터 공급자. 실제 주소·실제 거래가 아니다(가상의 "예시시 예시구").
// 예시 모드를 사용자가 직접 선택했을 때만 쓰며, 실제 API 실패를 이 데이터로 대체하지 않는다.
import type { AddressCandidate, BuildingRecord, LandRecord, ProviderMeta, ProviderResult, TradeRecord } from "../domain/property";

export const SAMPLE_SOURCE = "예시 데이터(가상의 주소·거래, 실제 아님)";

const meta = (note?: string): ProviderMeta => ({
  source: SAMPLE_SOURCE,
  provenance: "sample",
  fetchedAt: new Date().toISOString(),
  asOf: "2026-10-01(예시)",
  note,
});

const addr = (o: Partial<AddressCandidate> & Pick<AddressCandidate, "id" | "roadAddr" | "jibunAddr" | "admCd" | "lnbrMnnm" | "lnbrSlno" | "emdNm">): AddressCandidate => ({
  zipNo: "00000",
  mtYn: "0",
  bdMgtSn: null,
  bdNm: null,
  bdKdcd: "0",
  siNm: "예시시",
  sggNm: "예시구",
  provenance: "sample",
  ...o,
});

export const SAMPLE_ADDRESSES: AddressCandidate[] = [
  addr({ id: "sample-house", roadAddr: "예시시 예시구 예시로 12 (예시동)", jibunAddr: "예시시 예시구 예시동 101-3", admCd: "9999910100", lnbrMnnm: 101, lnbrSlno: 3, emdNm: "예시동" }),
  addr({ id: "sample-multi", roadAddr: "예시시 예시구 예시로 34 (예시동)", jibunAddr: "예시시 예시구 예시동 205-7", admCd: "9999910100", lnbrMnnm: 205, lnbrSlno: 7, emdNm: "예시동", bdNm: "예시빌" }),
  addr({ id: "sample-two-bldg", roadAddr: "예시시 예시구 샘플길 7 (샘플동)", jibunAddr: "예시시 예시구 샘플동 33-1", admCd: "9999910200", lnbrMnnm: 33, lnbrSlno: 1, emdNm: "샘플동" }),
  addr({ id: "sample-apt", roadAddr: "예시시 예시구 예시로 56, 101동 1203호 (예시동, 예시아파트)", jibunAddr: "예시시 예시구 예시동 300", admCd: "9999910100", lnbrMnnm: 300, lnbrSlno: 0, emdNm: "예시동", bdNm: "예시아파트", bdKdcd: "1" }),
];

const bld = (o: Partial<BuildingRecord>): BuildingRecord => ({
  mgmBldrgstPk: null,
  regstrKindCdNm: "일반건축물",
  mainAtchGbCdNm: "주건축물",
  mainPurpsCd: "01000",
  mainPurpsCdNm: "단독주택",
  etcPurps: null,
  strctCdNm: "벽돌구조",
  totArea: null,
  platArea: null,
  archArea: null,
  grndFlrCnt: null,
  ugrndFlrCnt: 0,
  useAprDay: null,
  hhldCnt: 1,
  fmlyCnt: 0,
  bldNm: null,
  dongNm: null,
  platPlc: null,
  newPlatPlc: null,
  bylotCnt: 0,
  ...o,
});

const SAMPLE_BUILDINGS: Record<string, BuildingRecord[]> = {
  "9999910100-0-101-3": [bld({ mgmBldrgstPk: "S-1001", totArea: 132.0, platArea: 165.3, archArea: 82.1, grndFlrCnt: 2, useAprDay: "19880615", etcPurps: "단독주택", platPlc: "예시시 예시구 예시동 101-3", newPlatPlc: "예시시 예시구 예시로 12" })],
  "9999910100-0-205-7": [
    bld({ mgmBldrgstPk: "S-2001", mainPurpsCd: "01003", mainPurpsCdNm: "다가구주택", strctCdNm: "철근콘크리트구조", totArea: 396.8, platArea: 231.4, archArea: 134.5, grndFlrCnt: 3, ugrndFlrCnt: 1, useAprDay: "19960320", hhldCnt: 1, fmlyCnt: 8, bldNm: "예시빌", platPlc: "예시시 예시구 예시동 205-7", newPlatPlc: "예시시 예시구 예시로 34" }),
  ],
  "9999910200-0-33-1": [
    bld({ mgmBldrgstPk: "S-3001", totArea: 89.2, platArea: 198.0, grndFlrCnt: 1, useAprDay: "19790910", strctCdNm: "목구조", dongNm: "본동", bylotCnt: 1, platPlc: "예시시 예시구 샘플동 33-1" }),
    bld({ mgmBldrgstPk: "S-3002", totArea: 45.6, platArea: 198.0, grndFlrCnt: 1, useAprDay: "19920505", strctCdNm: "블록구조", dongNm: "별동", bylotCnt: 1, platPlc: "예시시 예시구 샘플동 33-1" }),
  ],
  "9999910100-0-300-0": [bld({ mgmBldrgstPk: "S-4001", regstrKindCdNm: "집합건축물", mainPurpsCd: "02001", mainPurpsCdNm: "아파트", strctCdNm: "철근콘크리트구조", totArea: 15230, platArea: 9800, grndFlrCnt: 15, useAprDay: "20050301", hhldCnt: 120, bldNm: "예시아파트", dongNm: "101동" })],
};

const land = (pnu: string, o: Partial<LandRecord>): LandRecord => ({
  pnu,
  ldCodeNm: "예시시 예시구 예시동",
  mnnmSlno: null,
  lndcgrCodeNm: "대",
  lndpclAr: null,
  prposArea1Nm: "제2종일반주거지역",
  prposArea2Nm: "지정되지않음",
  ladUseSittnNm: "단독",
  roadSideCodeNm: "세로한면(가)",
  pblntfPclnd: null,
  stdrYear: "2026",
  lastUpdtDt: "2026-07-31",
  ...o,
});

const SAMPLE_LAND: Record<string, LandRecord> = {
  "9999910100101010003": land("9999910100101010003", { mnnmSlno: "101-3", lndpclAr: 165.3, pblntfPclnd: 2_350_000 }),
  "9999910100102050007": land("9999910100102050007", { mnnmSlno: "205-7", lndpclAr: 231.4, pblntfPclnd: 2_620_000, ladUseSittnNm: "다세대" }),
  "9999910200100330001": land("9999910200100330001", { ldCodeNm: "예시시 예시구 샘플동", mnnmSlno: "33-1", lndpclAr: 198.0, pblntfPclnd: 1_980_000, prposArea1Nm: "제1종일반주거지역" }),
  "9999910100103000000": land("9999910100103000000", { mnnmSlno: "300", lndpclAr: 9800, pblntfPclnd: 3_100_000, ladUseSittnNm: "아파트" }),
};

// 가상 거래 사례: [법정동, 대지㎡, 연면적㎡, 건축년도, 거래금액(만원), 계약일, 해제, 거래유형, 주택유형]
type Row = [string, number, number, number, number, string, boolean, string, string];
const HOUSE_ROWS: Row[] = [
  ["예시동", 158.0, 120.5, 1986, 72_000, "2025-11-14", false, "중개거래", "단독"],
  ["예시동", 172.4, 140.2, 1990, 79_500, "2025-12-03", false, "중개거래", "단독"],
  ["예시동", 149.6, 98.3, 1983, 66_800, "2026-01-22", false, "중개거래", "단독"],
  ["예시동", 181.0, 150.0, 1992, 84_000, "2026-02-09", false, "중개거래", "단독"],
  ["예시동", 165.0, 128.7, 1988, 75_000, "2026-03-17", false, "직거래", "단독"],
  ["예시동", 140.2, 110.0, 1985, 64_000, "2026-04-02", false, "중개거래", "단독"],
  ["예시동", 190.5, 160.4, 1994, 89_000, "2026-05-28", true, "중개거래", "단독"],
  ["예시동", 168.8, 135.0, 1987, 77_800, "2026-06-11", false, "중개거래", "단독"],
  ["예시동", 410.0, 380.0, 1999, 175_000, "2026-07-05", false, "중개거래", "다가구"],
  ["예시동", 226.0, 380.2, 1997, 112_000, "2026-07-19", false, "중개거래", "다가구"],
  ["예시동", 240.3, 410.5, 1995, 118_500, "2026-08-08", false, "중개거래", "다가구"],
  ["예시동", 218.7, 360.0, 1998, 106_000, "2026-08-26", false, "중개거래", "다가구"],
  ["예시동", 235.0, 395.0, 1994, 115_000, "2026-09-12", false, "중개거래", "다가구"],
  ["예시동", 155.2, 118.0, 1975, 68_000, "2026-09-20", false, "중개거래", "단독"],
  ["샘플동", 201.0, 92.0, 1980, 69_000, "2025-12-15", false, "중개거래", "단독"],
  ["샘플동", 188.5, 101.4, 1984, 66_500, "2026-02-21", false, "중개거래", "단독"],
  ["샘플동", 210.2, 120.0, 1990, 74_800, "2026-04-18", false, "중개거래", "단독"],
  ["샘플동", 176.0, 88.0, 1978, 61_000, "2026-06-30", false, "중개거래", "단독"],
  ["샘플동", 220.0, 140.5, 1995, 79_000, "2026-08-14", false, "중개거래", "단독"],
];

// 가상 토지 거래(지목 대)
const LAND_ROWS: [string, number, number, string][] = [
  ["예시동", 160.0, 83_000, "2025-12-20"],
  ["예시동", 175.5, 92_500, "2026-02-14"],
  ["예시동", 150.2, 77_000, "2026-04-25"],
  ["예시동", 182.0, 96_000, "2026-06-03"],
  ["예시동", 230.0, 122_000, "2026-07-29"],
  ["예시동", 210.0, 109_500, "2026-09-05"],
  ["샘플동", 195.0, 79_000, "2026-03-11"],
  ["샘플동", 205.0, 84_500, "2026-05-16"],
  ["샘플동", 188.0, 75_800, "2026-08-22"],
];

const houseTrades = (sggCd: string): TradeRecord[] =>
  HOUSE_ROWS.map(([umd, la, fa, by, amt, date, cancel, gbn, type], i) => ({
    kind: "house",
    sggCd,
    umdNm: umd,
    houseType: type,
    jibunPartial: `${(i % 9) + 1}**`,
    landArea: la,
    floorArea: fa,
    dealDate: date,
    amountWon: amt * 10_000,
    buildYear: by,
    cancelled: cancel,
    dealingGbn: gbn,
  }));

const landTrades = (sggCd: string): TradeRecord[] =>
  LAND_ROWS.map(([umd, area, amt, date], i) => ({
    kind: "land",
    sggCd,
    umdNm: umd,
    houseType: null,
    jibunPartial: `${(i % 7) + 2}**`,
    landArea: area,
    floorArea: null,
    dealDate: date,
    amountWon: amt * 10_000,
    buildYear: null,
    cancelled: false,
    dealingGbn: "중개거래",
    landUse: "대",
  }));

export function sampleSearch(keyword: string): ProviderResult<AddressCandidate[]> {
  const q = keyword.replace(/\s+/g, "");
  const hits = SAMPLE_ADDRESSES.filter((a) => (a.roadAddr + a.jibunAddr + (a.bdNm ?? "")).replace(/\s+/g, "").includes(q));
  return {
    ok: true,
    data: hits.length ? hits : SAMPLE_ADDRESSES,
    meta: meta(hits.length ? undefined : "예시 모드에서는 아래 예시 주소만 조회할 수 있습니다."),
  };
}

export function sampleBuildings(key: string): ProviderResult<BuildingRecord[]> {
  const b = SAMPLE_BUILDINGS[key];
  if (!b) return { ok: false, error: { kind: "no_result", source: SAMPLE_SOURCE, message: "예시 건축물 정보 없음" } };
  return { ok: true, data: b, meta: meta() };
}

export function sampleLand(pnu: string): ProviderResult<LandRecord> {
  const l = SAMPLE_LAND[pnu];
  if (!l) return { ok: false, error: { kind: "no_result", source: SAMPLE_SOURCE, message: "예시 토지 정보 없음" } };
  return { ok: true, data: l, meta: meta() };
}

export function sampleHouseTrades(lawdCd: string): ProviderResult<TradeRecord[]> & { monthsQueried?: string[]; failedMonths?: string[] } {
  return { ok: true, data: houseTrades(lawdCd), meta: meta("가상의 거래 사례"), monthsQueried: [], failedMonths: [] };
}

export function sampleLandTrades(lawdCd: string): ProviderResult<TradeRecord[]> {
  return { ok: true, data: landTrades(lawdCd), meta: meta("가상의 토지 거래 사례") };
}

/**
 * 예시 모드 전용 리모델링 후 가치·임대료 가정. 공사비 대비 상승률로 만든 값이 아니라
 * 화면 흐름을 보여주기 위한 가상의 "주변 리모델링 주택 시세" 예시다.
 */
export const SAMPLE_REMODEL_ASSUMPTIONS: Record<string, { remodelPrice: { low: number; base: number; high: number }; remodelRentMonthly: { low: number; base: number; high: number } }> = {
  "sample-house": { remodelPrice: { low: 820_000_000, base: 870_000_000, high: 920_000_000 }, remodelRentMonthly: { low: 2_200_000, base: 2_500_000, high: 2_800_000 } },
  "sample-multi": { remodelPrice: { low: 1_180_000_000, base: 1_260_000_000, high: 1_330_000_000 }, remodelRentMonthly: { low: 5_600_000, base: 6_200_000, high: 6_800_000 } },
  "sample-two-bldg": { remodelPrice: { low: 760_000_000, base: 810_000_000, high: 860_000_000 }, remodelRentMonthly: { low: 1_900_000, base: 2_150_000, high: 2_400_000 } },
};
