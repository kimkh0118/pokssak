// 주소기반산업지원서비스 도로명주소 검색 API
// 요청: https://business.juso.go.kr/addrlink/addrLinkApi.do (confmKey, currentPage, countPerPage, keyword, resultType=json)
// 응답: results.common{totalCount, errorCode, errorMessage}, results.juso[]{roadAddr, jibunAddr, zipNo, admCd, bdMgtSn, bdNm, bdKdcd, siNm, sggNm, emdNm, mtYn, lnbrMnnm, lnbrSlno ...}
// 출처: 주소기반산업지원서비스 개발자 안내(검색API 출력결과·오류코드 표) 확인, 2026-10-21
import "server-only";
import type { AddressCandidate, ProviderResult } from "../domain/property";
import { parseNumberOrNull } from "../domain/units";
import { env, err, fetchText } from "./http";

export const JUSO_SOURCE = "행정안전부 주소기반산업지원서비스 도로명주소 검색 API";
const ENDPOINT = "https://business.juso.go.kr/addrlink/addrLinkApi.do";

/** 오류코드 → 구분 (E0001 미승인 키, E0014 개발키 만료, E0005~E0013·E0015 검색어 문제, -999 시스템 오류) */
export function classifyJusoError(code: string): "auth" | "invalid_request" | "upstream" {
  if (code === "E0001" || code === "E0014") return "auth";
  if (code === "-999") return "upstream";
  return "invalid_request";
}

interface JusoRaw {
  roadAddr?: string;
  jibunAddr?: string;
  zipNo?: string;
  admCd?: string;
  bdMgtSn?: string;
  bdNm?: string;
  bdKdcd?: string;
  siNm?: string;
  sggNm?: string;
  emdNm?: string;
  mtYn?: string;
  lnbrMnnm?: string | number;
  InbrMnnm?: string | number; // 공식 문서 표기 오탈자 대비
  lnbrSlno?: string | number;
}

export function mapJuso(j: JusoRaw): AddressCandidate {
  const admCd = String(j.admCd ?? "");
  const bun = parseNumberOrNull(j.lnbrMnnm ?? j.InbrMnnm);
  const ji = parseNumberOrNull(j.lnbrSlno);
  return {
    id: `${admCd}-${j.mtYn ?? "0"}-${bun ?? ""}-${ji ?? ""}-${j.bdMgtSn ?? ""}`,
    roadAddr: j.roadAddr ?? "",
    jibunAddr: j.jibunAddr ?? "",
    zipNo: j.zipNo ?? null,
    admCd,
    mtYn: j.mtYn === "1" ? "1" : "0",
    lnbrMnnm: bun,
    lnbrSlno: ji,
    bdMgtSn: j.bdMgtSn ?? null,
    bdNm: j.bdNm || null,
    bdKdcd: j.bdKdcd === "1" ? "1" : j.bdKdcd === "0" ? "0" : null,
    siNm: j.siNm ?? "",
    sggNm: j.sggNm ?? "",
    emdNm: j.emdNm ?? "",
    provenance: "public_api",
  };
}

export async function searchJuso(keyword: string, page = 1): Promise<ProviderResult<AddressCandidate[]>> {
  const key = env.jusoKey();
  if (!key) return { ok: false, error: err("not_configured", JUSO_SOURCE, "JUSO_API_KEY가 설정되지 않았습니다.") };
  const qs = new URLSearchParams({ confmKey: key, currentPage: String(page), countPerPage: "10", keyword, resultType: "json" });
  const r = await fetchText(`${ENDPOINT}?${qs}`, JUSO_SOURCE);
  if (!r.ok) return r;
  let body: { results?: { common?: { errorCode?: string; errorMessage?: string; totalCount?: string }; juso?: JusoRaw[] | null } };
  try {
    body = JSON.parse(r.text);
  } catch {
    return { ok: false, error: err("parse", JUSO_SOURCE, `응답을 해석하지 못했습니다(HTTP ${r.status}).`) };
  }
  const common = body.results?.common;
  const code = common?.errorCode ?? "";
  if (code !== "0") {
    return { ok: false, error: err(classifyJusoError(code), JUSO_SOURCE, common?.errorMessage ?? "알 수 없는 오류", code) };
  }
  const list = (body.results?.juso ?? []).map(mapJuso);
  return { ok: true, data: list, meta: { source: JUSO_SOURCE, provenance: "public_api", fetchedAt: new Date().toISOString() } };
}
