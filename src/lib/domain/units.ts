// 단위 변환과 금액 표시 도우미. 계산은 항상 원·㎡ 단위로 한다.

export const WON_PER_MANWON = 10_000;
export const SQM_PER_PYEONG = 400 / 121; // 1평 = 400/121 ㎡ ≈ 3.305785㎡

export const manwonToWon = (manwon: number): number => Math.round(manwon * WON_PER_MANWON);
export const wonToManwon = (won: number): number => won / WON_PER_MANWON;
export const pyeongToSqm = (pyeong: number): number => pyeong * SQM_PER_PYEONG;
export const sqmToPyeong = (sqm: number): number => sqm / SQM_PER_PYEONG;
/** ㎡당 단가 → 평당 단가 */
export const perSqmToPerPyeong = (wonPerSqm: number): number => wonPerSqm * SQM_PER_PYEONG;
export const perPyeongToPerSqm = (wonPerPyeong: number): number => wonPerPyeong / SQM_PER_PYEONG;

/**
 * 공공데이터 문자열 숫자를 안전하게 파싱한다.
 * "12,345" "  12345 " 모두 허용. 빈 값·숫자 아님은 null(0이 아님).
 */
export function parseNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 실거래가 API의 거래금액(만원, 쉼표 포함 문자열) → 원 */
export function parseDealAmountManwonToWon(v: unknown): number | null {
  const n = parseNumberOrNull(v);
  return n === null ? null : manwonToWon(n);
}

/** 금액을 "3억 4,000만 원" 형태로 표시 */
export function formatWon(won: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (won === null || won === undefined || !Number.isFinite(won)) return "산정 불가";
  const sign = won < 0 ? "-" : opts.signed && won > 0 ? "+" : "";
  const abs = Math.abs(Math.round(won));
  const eok = Math.floor(abs / 100_000_000);
  const man = Math.round((abs % 100_000_000) / 10_000);
  if (eok === 0 && man === 0) return abs === 0 ? "0원" : `${sign}${abs.toLocaleString("ko-KR")}원`;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  return `${sign}${parts.join(" ")} 원`;
}

export function formatArea(sqm: number | null | undefined): string {
  if (sqm === null || sqm === undefined || !Number.isFinite(sqm)) return "정보 없음";
  return `${sqm.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}㎡ (약 ${sqmToPyeong(sqm).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}평)`;
}

export function formatMonths(m: number | null | undefined): string {
  if (m === null || m === undefined || !Number.isFinite(m)) return "산정 불가";
  if (m < 12) return `약 ${m}개월`;
  const y = Math.floor(m / 12);
  const r = m % 12;
  return r === 0 ? `약 ${y}년` : `약 ${y}년 ${r}개월`;
}
