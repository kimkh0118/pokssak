// 국토교통부 건축HUB 건축물대장정보 서비스 — 표제부 조회(getBrTitleInfo)
// https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo
// 요청: serviceKey, sigunguCd, bjdongCd, platGbCd(0 대지 1 산 2 블록), bun, ji, _type=json, numOfRows, pageNo
// 응답 필드는 공공데이터포털 15134735 활용명세(Swagger)에서 확인, 2026-10-21
import "server-only";
import type { BuildingRecord, ParcelKey, ProviderResult } from "../domain/property";
import { parseNumberOrNull } from "../domain/units";
import { parseDataGoKr } from "./dataGoKr";
import { env, err, fetchText } from "./http";

export const BUILDING_SOURCE = "국토교통부 건축HUB 건축물대장정보 서비스(표제부)";
const ENDPOINT = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";

const FIELDS: (keyof BuildingRecord)[] = ["mainPurpsCdNm", "strctCdNm", "totArea", "grndFlrCnt", "useAprDay", "platArea"];

export function mapBuilding(i: Record<string, unknown>): BuildingRecord {
  const s = (k: string) => {
    const v = i[k];
    return v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();
  };
  return {
    mgmBldrgstPk: s("mgmBldrgstPk"),
    regstrKindCdNm: s("regstrKindCdNm"),
    mainAtchGbCdNm: s("mainAtchGbCdNm"),
    mainPurpsCd: s("mainPurpsCd"),
    mainPurpsCdNm: s("mainPurpsCdNm"),
    etcPurps: s("etcPurps"),
    strctCdNm: s("strctCdNm"),
    totArea: parseNumberOrNull(i.totArea),
    platArea: parseNumberOrNull(i.platArea),
    archArea: parseNumberOrNull(i.archArea),
    grndFlrCnt: parseNumberOrNull(i.grndFlrCnt),
    ugrndFlrCnt: parseNumberOrNull(i.ugrndFlrCnt),
    useAprDay: s("useAprDay"),
    hhldCnt: parseNumberOrNull(i.hhldCnt),
    fmlyCnt: parseNumberOrNull(i.fmlyCnt),
    bldNm: s("bldNm"),
    dongNm: s("dongNm"),
    platPlc: s("platPlc"),
    newPlatPlc: s("newPlatPlc"),
    bylotCnt: parseNumberOrNull(i.bylotCnt),
  };
}

export function missingBuildingFields(records: BuildingRecord[]): string[] {
  const out = new Set<string>();
  for (const r of records) for (const f of FIELDS) if (r[f] === null) out.add(f);
  return [...out];
}

export async function getBuildingTitles(parcel: ParcelKey): Promise<ProviderResult<BuildingRecord[]>> {
  const key = env.dataGoKrKey();
  if (!key) return { ok: false, error: err("not_configured", BUILDING_SOURCE, "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.") };
  const qs = new URLSearchParams({
    serviceKey: key,
    sigunguCd: parcel.sigunguCd,
    bjdongCd: parcel.bjdongCd,
    platGbCd: parcel.platGbCd,
    bun: parcel.bun,
    ji: parcel.ji,
    _type: "json",
    numOfRows: "100",
    pageNo: "1",
  });
  const r = await fetchText(`${ENDPOINT}?${qs}`, BUILDING_SOURCE);
  if (!r.ok) return r;
  const parsed = parseDataGoKr<Record<string, unknown>>(r.text, r.status, BUILDING_SOURCE);
  if (!parsed.ok) return parsed;
  if (parsed.value.items.length === 0) return { ok: false, error: err("no_result", BUILDING_SOURCE, "해당 지번의 건축물대장 표제부가 없습니다.") };
  const records = parsed.value.items.map(mapBuilding);
  return {
    ok: true,
    data: records,
    meta: {
      source: BUILDING_SOURCE,
      provenance: "public_api",
      fetchedAt: new Date().toISOString(),
      asOf: (parsed.value.items[0]?.crtnDay as string | undefined) ?? null,
      missingFields: missingBuildingFields(records),
      note: "기준일은 대장 생성일자(crtnDay)",
    },
  };
}
