// 공공데이터포털(apis.data.go.kr) 공통 응답 해석.
// - 정상: response.header.resultCode = "00"/"000", response.body.items.item (배열 또는 단건, 결과 없으면 빈 문자열)
// - 게이트웨이 오류: OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode (예: 30 등록되지 않은 서비스키, HTTP 403)
//   2026-10-21 실제 호출(잘못된 키)로 JSON·XML 두 형식 모두 확인.
import "server-only";
import { XMLParser } from "fast-xml-parser";
import type { ProviderError, ProviderErrorKind } from "../domain/property";
import { err } from "./http";

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

/** 공공데이터포털 공통 오류코드 → 구분 */
export function classifyDataGoKrCode(code: string): ProviderErrorKind {
  switch (code) {
    case "03":
      return "no_result";
    case "20": // 서비스 접근거부
    case "30": // 등록되지 않은 서비스키
    case "31": // 기한만료된 서비스키
    case "32": // 등록되지 않은 IP
    case "12": // 해당 오픈API 서비스가 없거나 폐기됨
      return "auth";
    case "22": // 서비스 요청제한횟수 초과
      return "rate_limit";
    case "10": // 잘못된 요청 파라미터
    case "11": // 필수 요청 파라미터 없음
      return "invalid_request";
    default:
      return "upstream";
  }
}

export interface ParsedItems<T> {
  items: T[];
  totalCount: number | null;
}

export function parseDataGoKr<T>(text: string, status: number, source: string): { ok: true; value: ParsedItems<T> } | { ok: false; error: ProviderError } {
  let body: Record<string, unknown>;
  const trimmed = text.trim();
  try {
    body = trimmed.startsWith("<") ? xml.parse(trimmed) : JSON.parse(trimmed);
  } catch {
    if (status === 401 || status === 403) return { ok: false, error: err("auth", source, `인증 오류(HTTP ${status})`) };
    if (status === 429) return { ok: false, error: err("rate_limit", source, "호출 제한을 초과했습니다.") };
    return { ok: false, error: err("parse", source, `응답을 해석하지 못했습니다(HTTP ${status}).`) };
  }

  const gw = (body as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: Record<string, string> } }).OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gw) {
    const code = String(gw.returnReasonCode ?? "");
    return { ok: false, error: err(classifyDataGoKrCode(code), source, gw.returnAuthMsg || gw.errMsg || "게이트웨이 오류", code) };
  }

  const resp = (body as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: Record<string, unknown> } }).response;
  if (!resp) {
    if (status === 401 || status === 403) return { ok: false, error: err("auth", source, `인증 오류(HTTP ${status})`) };
    return { ok: false, error: err("parse", source, "예상한 응답 형식이 아닙니다.") };
  }
  const code = String(resp.header?.resultCode ?? "");
  if (code !== "00" && code !== "000") {
    const kind = classifyDataGoKrCode(code.replace(/^0(?=\d\d$)/, ""));
    if (kind === "no_result") return { ok: true, value: { items: [], totalCount: 0 } };
    return { ok: false, error: err(kind, source, resp.header?.resultMsg ?? "오류", code) };
  }
  const b = resp.body ?? {};
  const itemsNode = b.items as { item?: T | T[] } | string | undefined;
  let items: T[] = [];
  if (itemsNode && typeof itemsNode === "object" && itemsNode.item !== undefined) {
    items = Array.isArray(itemsNode.item) ? itemsNode.item : [itemsNode.item];
  }
  const total = b.totalCount !== undefined ? Number(b.totalCount) : null;
  return { ok: true, value: { items, totalCount: Number.isFinite(total) ? total : null } };
}
