// '내 분석' 목록: 이 브라우저에만 분석 ID와 주소를 저장한다(서버 계정 없음).
// 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서도 화면이 깨지지 않게 모두 try/catch.
export interface HistoryItem {
  id: string;
  address: string;
  mode: "live" | "sample";
  savedAt: string;
}

const KEY = "home-compare.history.v1";
const MAX = 30;

export function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as HistoryItem[]) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x?.id === "string") : [];
  } catch {
    return [];
  }
}

export function addHistory(item: Omit<HistoryItem, "savedAt">) {
  try {
    const list = readHistory().filter((x) => x.id !== item.id);
    list.unshift({ ...item, savedAt: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* 저장 불가 환경은 무시 */
  }
}

export function removeHistory(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readHistory().filter((x) => x.id !== id)));
  } catch {
    /* 무시 */
  }
}
