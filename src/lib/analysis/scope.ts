// 지원 범위 판정과 분석 대상 확인 필요 여부. 초기 지원 대상은 단독·다가구주택(건축물대장 주용도 01xxx 단독주택군).
import type { AddressCandidate, BuildingRecord, ParcelKey, ProviderResult, ScopeCheck } from "../domain/property";

const COLLECTIVE = ["아파트", "연립주택", "다세대주택", "공동주택", "오피스텔"];

export function toParcel(a: AddressCandidate): ParcelKey | null {
  if (!/^\d{10}$/.test(a.admCd) || a.lnbrMnnm === null) return null;
  const bun = String(a.lnbrMnnm).padStart(4, "0");
  const ji = String(a.lnbrSlno ?? 0).padStart(4, "0");
  return {
    admCd: a.admCd,
    sigunguCd: a.admCd.slice(0, 5),
    bjdongCd: a.admCd.slice(5),
    platGbCd: a.mtYn === "1" ? "1" : "0",
    bun,
    ji,
    // PNU: 법정동코드 10 + 대장구분 1(1 일반, 2 산) + 본번 4 + 부번 4
    pnu: `${a.admCd}${a.mtYn === "1" ? "2" : "1"}${bun}${ji}`,
  };
}

export const isMain = (b: BuildingRecord) => !b.mainAtchGbCdNm || b.mainAtchGbCdNm.includes("주건축물");
const isDetachedGroup = (b: BuildingRecord) =>
  (b.mainPurpsCd?.startsWith("01") ?? false) || ["단독주택", "다가구주택", "다중주택"].some((x) => b.mainPurpsCdNm?.includes(x));

export function checkScope(address: AddressCandidate, buildings: ProviderResult<BuildingRecord[]>): ScopeCheck {
  if (address.bdKdcd === "1") {
    return { status: "unsupported", reason: "공동주택(아파트·연립·다세대 등)의 개별 호실은 현재 지원하지 않습니다. 호실을 건물 전체처럼 보고 철거를 판단할 수 없기 때문입니다." };
  }
  if (!buildings.ok) {
    return { status: "unconfirmed", reason: `건축물대장 정보를 확인하지 못했습니다(${buildings.error.message}). 단독·다가구주택인지 직접 확인해야 합니다.` };
  }
  const main = buildings.data.filter(isMain);
  if (buildings.data.some((b) => b.regstrKindCdNm?.includes("집합") || COLLECTIVE.some((c) => b.mainPurpsCdNm?.includes(c)))) {
    return { status: "unsupported", reason: "집합건축물·공동주택은 현재 지원하지 않습니다(초기 지원 대상: 단독·다가구주택)." };
  }
  if (main.length === 0) return { status: "unconfirmed", reason: "주건축물 정보가 없어 지원 대상인지 확인할 수 없습니다." };
  if (!main.some(isDetachedGroup)) {
    const purposes = [...new Set(main.map((b) => b.mainPurpsCdNm ?? "알 수 없음"))].join(", ");
    return { status: "unsupported", reason: `건축물 주용도가 '${purposes}'입니다. 현재는 단독·다가구주택만 지원합니다.` };
  }
  return { status: "supported", reason: "단독·다가구주택(건축물대장 주용도 기준)" };
}

export function targetReasons(buildings: ProviderResult<BuildingRecord[]>): string[] {
  if (!buildings.ok) return [];
  const main = buildings.data.filter(isMain);
  const out: string[] = [];
  if (main.length > 1) out.push(`이 지번에 주건축물이 ${main.length}개 있습니다. 분석할 건물을 선택해 주세요.`);
  if (buildings.data.some((b) => (b.bylotCnt ?? 0) > 0)) out.push("건물이 다른 필지(외필지)에도 걸쳐 있습니다. 토지 정보는 대표 필지 기준으로만 조회됩니다.");
  return out;
}
