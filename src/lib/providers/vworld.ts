// 브이월드 국가중점데이터 API — 토지특성속성조회(getLandCharacteristics)
// https://api.vworld.kr/ned/data/getLandCharacteristics (key, pnu, stdrYear, format=json, numOfRows, pageNo, domain)
// 응답 필드(pnu, ldCodeNm, mnnmSlno, stdrYear, lndcgrCodeNm, lndpclAr, prposArea1Nm, prposArea2Nm, ladUseSittnNm,
//   roadSideCodeNm, pblntfPclnd(원/㎡), lastUpdtDt)는 브이월드 개발자센터 API 상세 페이지에서 확인, 2026-10-21.
// 오류 응답 형식 {"landCharacteristicss":{"resultCode":"INVALID_KEY", ...}} 은 실제 호출로 확인.
// 정상 응답(2026-10-21 실제 키로 확인): landCharacteristicss{resultCode:"", totalCount, field:[...]}.
//   기준연도 오름차순이며 같은 연도에 기준월(stdrMt)이 다른 행이 여러 개 올 수 있다.
// 인증: 키 발급 시 등록한 서비스 URL과 요청의 Referer 가 맞아야 한다(domain 파라미터만으로는 INCORRECT_KEY).
import "server-only";
import type { LandRecord, ProviderResult } from "../domain/property";
import { parseNumberOrNull } from "../domain/units";
import { env, err, fetchText } from "./http";

export const LAND_SOURCE = "국토교통부 브이월드 토지특성정보(토지특성속성조회)";
const ENDPOINT = "https://api.vworld.kr/ned/data/getLandCharacteristics";

export function classifyVworldCode(code: string) {
  if (["INVALID_KEY", "INCORRECT_KEY", "UNAVAILABLE_KEY"].includes(code)) return "auth" as const;
  if (code === "OVER_REQUEST_LIMIT") return "rate_limit" as const;
  if (["URL_TYPE", "PARAM_REQUIRED", "INVALID_TYPE", "INVALID_RANGE"].includes(code)) return "invalid_request" as const;
  return "upstream" as const;
}

export function mapLand(f: Record<string, unknown>): LandRecord {
  const s = (k: string) => (f[k] === undefined || f[k] === null || String(f[k]).trim() === "" ? null : String(f[k]).trim());
  return {
    pnu: s("pnu") ?? "",
    ldCodeNm: s("ldCodeNm"),
    mnnmSlno: s("mnnmSlno"),
    lndcgrCodeNm: s("lndcgrCodeNm"),
    lndpclAr: parseNumberOrNull(f.lndpclAr),
    prposArea1Nm: s("prposArea1Nm"),
    prposArea2Nm: s("prposArea2Nm"),
    ladUseSittnNm: s("ladUseSittnNm"),
    roadSideCodeNm: s("roadSideCodeNm"),
    pblntfPclnd: parseNumberOrNull(f.pblntfPclnd),
    stdrYear: s("stdrYear"),
    stdrMt: s("stdrMt"),
    lastUpdtDt: s("lastUpdtDt"),
  };
}

/** 여러 기준연도·기준월 결과 중 가장 최신 1건 선택(연도 → 월 → 데이터기준일자 순) */
export function pickLatest(rows: LandRecord[]): LandRecord | null {
  const key = (r: LandRecord) => `${(r.stdrYear ?? "0000").padStart(4, "0")}${(r.stdrMt ?? "00").padStart(2, "0")}${r.lastUpdtDt ?? ""}`;
  return [...rows].sort((a, b) => key(b).localeCompare(key(a)))[0] ?? null;
}

export function parseVworldLand(text: string): ProviderResult<LandRecord> {
  let body: { landCharacteristicss?: { resultCode?: string; resultMsg?: string; field?: unknown } };
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: err("parse", LAND_SOURCE, "응답을 해석하지 못했습니다.") };
  }
  const node = body.landCharacteristicss;
  if (!node) return { ok: false, error: err("parse", LAND_SOURCE, "예상한 응답 형식이 아닙니다.") };
  // 문서에 있는 오류코드만 오류로 본다(정상 응답의 resultCode 값은 실제 키로 미검증)
  const KNOWN_ERRORS = ["URL_TYPE", "PARAM_REQUIRED", "INVALID_TYPE", "INVALID_RANGE", "INVALID_KEY", "INCORRECT_KEY", "UNAVAILABLE_KEY", "OVER_REQUEST_LIMIT", "SYSTEM_ERROR", "UNKNOWN_ERROR"];
  if (node.resultCode && KNOWN_ERRORS.includes(node.resultCode)) {
    return { ok: false, error: err(classifyVworldCode(node.resultCode), LAND_SOURCE, node.resultMsg ?? node.resultCode, node.resultCode) };
  }
  const raw = node.field;
  const rows = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x) => mapLand(x as Record<string, unknown>));
  const latest = pickLatest(rows);
  if (!latest) return { ok: false, error: err("no_result", LAND_SOURCE, "해당 필지의 토지특성 정보가 없습니다.") };
  const missing = (["lndcgrCodeNm", "lndpclAr", "prposArea1Nm", "pblntfPclnd", "stdrYear"] as (keyof LandRecord)[]).filter((k) => latest[k] === null);
  return {
    ok: true,
    data: latest,
    meta: { source: LAND_SOURCE, provenance: "public_api", fetchedAt: new Date().toISOString(), asOf: latest.lastUpdtDt, missingFields: missing as string[] },
  };
}

export async function getLandCharacteristics(pnu: string): Promise<ProviderResult<LandRecord>> {
  const key = env.vworldKey();
  if (!key) return { ok: false, error: err("not_configured", LAND_SOURCE, "VWORLD_API_KEY가 설정되지 않았습니다.") };
  // 연도별 이력이 모두 오므로 최대 건수로 받아 최신 값을 고른다
  const qs = new URLSearchParams({ key, pnu, format: "json", numOfRows: "1000", pageNo: "1" });
  const domain = env.vworldDomain();
  const r = await fetchText(`${ENDPOINT}?${qs}`, LAND_SOURCE, domain ? { Referer: domain.endsWith("/") ? domain : `${domain}/` } : {});
  if (!r.ok) return r;
  return parseVworldLand(r.text);
}
