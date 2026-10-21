// 금액·면적·기간 표시. 계산은 백엔드에서 원·㎡ 단위로 한다.

export const WON_PER_MANWON = 10_000;
export const SQM_PER_PYEONG = 400 / 121; // 1평 = 400/121 ㎡ ≈ 3.305785㎡

export const manwonToWon = (manwon: number): number => Math.round(manwon * WON_PER_MANWON);
export const wonToManwon = (won: number): number => won / WON_PER_MANWON;
export const pyeongToSqm = (pyeong: number): number => pyeong * SQM_PER_PYEONG;
export const sqmToPyeong = (sqm: number): number => sqm / SQM_PER_PYEONG;
/** ㎡당 단가 → 평당 단가 */
export const perSqmToPerPyeong = (wonPerSqm: number): number => wonPerSqm * SQM_PER_PYEONG;
export const perPyeongToPerSqm = (wonPerPyeong: number): number => wonPerPyeong / SQM_PER_PYEONG;

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
