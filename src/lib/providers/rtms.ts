// 국토교통부 단독/다가구 매매 실거래가 자료
// https://apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade (serviceKey, LAWD_CD 5자리, DEAL_YMD 6자리, pageNo, numOfRows) — XML 응답
// 응답 필드는 공공데이터포털 15126465 활용명세(Swagger)에서 확인, 2026-10-21.
// 지역·계약년월 단위 자료이고 지번이 일부만 공개되므로 대상 주소의 거래 이력으로 연결하지 않는다.
import "server-only";
import type { ProviderResult, TradeRecord } from "../domain/property";
import { parseDealAmountManwonToWon, parseNumberOrNull } from "../domain/units";
import { parseDataGoKr } from "./dataGoKr";
import { env, err, fetchText } from "./http";

export const TRADE_SOURCE = "국토교통부 단독/다가구 매매 실거래가 자료";
const ENDPOINT = "https://apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade";

export function mapTrade(i: Record<string, unknown>): TradeRecord {
  const s = (k: string) => (i[k] === undefined || i[k] === null || String(i[k]).trim() === "" ? null : String(i[k]).trim());
  const y = s("dealYear") ?? "0000";
  const m = (s("dealMonth") ?? "1").padStart(2, "0");
  const d = (s("dealDay") ?? "1").padStart(2, "0");
  return {
    kind: "house",
    sggCd: s("sggCd"),
    umdNm: s("umdNm"),
    houseType: s("houseType"),
    jibunPartial: s("jibun"),
    landArea: parseNumberOrNull(i.plottageAr),
    floorArea: parseNumberOrNull(i.totalFloorAr),
    dealDate: `${y}-${m}-${d}`,
    amountWon: parseDealAmountManwonToWon(i.dealAmount),
    // 실제 자료에 건축년도 미상이 1900 등으로 들어오는 경우가 있어 1901년 미만은 미상(null)으로 본다
    buildYear: (() => {
      const y = parseNumberOrNull(i.buildYear);
      return y !== null && y > 1900 ? y : null;
    })(),
    cancelled: s("cdealType") === "O" || !!s("cdealDay"),
    dealingGbn: s("dealingGbn"),
  };
}

/** 기준월로부터 과거 n개월의 YYYYMM 목록(기준월 제외, 신고 지연 고려) */
export function recentMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function getHouseTrades(
  lawdCd: string,
  months: string[],
): Promise<ProviderResult<TradeRecord[]> & { monthsQueried?: string[]; failedMonths?: string[] }> {
  const key = env.dataGoKrKey();
  if (!key) return { ok: false, error: err("not_configured", TRADE_SOURCE, "DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다.") };
  const results = await Promise.all(
    months.map(async (ym) => {
      const qs = new URLSearchParams({ serviceKey: key, LAWD_CD: lawdCd, DEAL_YMD: ym, pageNo: "1", numOfRows: "1000" });
      const r = await fetchText(`${ENDPOINT}?${qs}`, TRADE_SOURCE);
      if (!r.ok) return { ym, ok: false as const, error: r.error };
      const p = parseDataGoKr<Record<string, unknown>>(r.text, r.status, TRADE_SOURCE);
      return p.ok ? { ym, ok: true as const, items: p.value.items.map(mapTrade) } : { ym, ok: false as const, error: p.error };
    }),
  );
  const failed = results.filter((x) => !x.ok);
  const okRes = results.filter((x) => x.ok);
  // 인증·호출제한 오류는 전체 실패로 본다(부분 결과로 조용히 대체하지 않음)
  const fatal = failed.find((x) => !x.ok && (x.error.kind === "auth" || x.error.kind === "rate_limit" || x.error.kind === "not_configured"));
  if (fatal && !fatal.ok) return { ok: false, error: fatal.error };
  if (okRes.length === 0 && failed[0] && !failed[0].ok) return { ok: false, error: failed[0].error };
  const data = okRes.flatMap((x) => (x.ok ? x.items : []));
  return {
    ok: true,
    data,
    monthsQueried: months,
    failedMonths: failed.map((x) => x.ym),
    meta: {
      source: TRADE_SOURCE,
      provenance: "public_api",
      fetchedAt: new Date().toISOString(),
      asOf: `${months[months.length - 1]}~${months[0]} 계약분`,
      note: failed.length ? `일부 월 조회 실패: ${failed.map((x) => x.ym).join(", ")}` : undefined,
    },
  };
}
