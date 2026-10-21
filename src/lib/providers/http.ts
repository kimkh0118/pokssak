// 공공데이터 호출 공통 도우미. 서버에서만 사용한다.
// 인증키는 환경변수에서 읽고, URL·오류 메시지·로그에 남지 않도록 가린다.
import "server-only";
import type { ProviderError, ProviderErrorKind } from "../domain/property";

export const env = {
  jusoKey: () => process.env.JUSO_API_KEY?.trim() || null,
  dataGoKrKey: () => process.env.DATA_GO_KR_SERVICE_KEY?.trim() || null,
  vworldKey: () => process.env.VWORLD_API_KEY?.trim() || null,
  vworldDomain: () => process.env.VWORLD_DOMAIN?.trim() || null,
  timeoutMs: () => Number(process.env.PUBLIC_API_TIMEOUT_MS || 10_000),
};

const SECRET_PARAMS = ["serviceKey", "confmKey", "key"];

/** 로그용: 인증키 파라미터를 가린 URL */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of SECRET_PARAMS) if (u.searchParams.has(k)) u.searchParams.set(k, "***");
    return u.toString();
  } catch {
    return "[invalid-url]";
  }
}

export function redactText(text: string): string {
  let out = text;
  for (const v of [env.jusoKey(), env.dataGoKrKey(), env.vworldKey()]) {
    if (v) out = out.split(v).join("***").split(encodeURIComponent(v)).join("***");
  }
  return out;
}

export function err(kind: ProviderErrorKind, source: string, message: string, code?: string): ProviderError {
  return { kind, source, message: redactText(message), code };
}

export type FetchOutcome = { ok: true; status: number; text: string } | { ok: false; error: ProviderError };

export async function fetchText(url: string, source: string, extraHeaders: Record<string, string> = {}): Promise<FetchOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), env.timeoutMs());
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store", headers: { Accept: "application/json, application/xml;q=0.9, */*;q=0.8", ...extraHeaders } });
    const text = await res.text();
    return { ok: true, status: res.status, text };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    console.warn(`[public-api] ${source} 호출 실패: ${aborted ? "timeout" : (e as Error)?.message} ${redactUrl(url)}`);
    return { ok: false, error: err("network", source, aborted ? "응답 시간이 초과되었습니다." : "네트워크 오류로 조회하지 못했습니다.") };
  } finally {
    clearTimeout(timer);
  }
}
