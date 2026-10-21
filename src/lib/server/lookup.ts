// 주소 검색과 토지·건축물·거래 사례 조회를 묶는다. 데이터 제공기관은 providers/* 에서 교체할 수 있다.
// 실제 모드(live)의 실패는 실패로 돌려주고, 예시 데이터로 대체하지 않는다.
import "server-only";
import type { DataMode } from "../domain/types";
import type { AddressCandidate, PropertyLookup, ProviderResult } from "../domain/property";
import { searchJuso } from "../providers/juso";
import { getBuildingTitles } from "../providers/buildingHub";
import { getLandCharacteristics } from "../providers/vworld";
import { getHouseTrades, recentMonths } from "../providers/rtms";
import { SAMPLE_ADDRESSES, sampleBuildings, sampleHouseTrades, sampleLand, sampleLandTrades, sampleSearch } from "../providers/sample";
import { checkScope, isMain, targetReasons, toParcel } from "../analysis/scope";
import { getDb, newId } from "./db";

export async function searchAddress(mode: DataMode, keyword: string): Promise<ProviderResult<AddressCandidate[]>> {
  return mode === "sample" ? sampleSearch(keyword) : searchJuso(keyword);
}

const noParcel = <T,>(source: string): ProviderResult<T> => ({
  ok: false,
  error: { kind: "invalid_request", source, message: "지번 정보가 없어 조회할 수 없습니다." },
});

export async function lookupProperty(mode: DataMode, address: AddressCandidate): Promise<PropertyLookup> {
  if (mode === "sample") {
    // 예시 모드는 서버에 있는 예시 주소만 허용(클라이언트가 보낸 값을 그대로 믿지 않음)
    const known = SAMPLE_ADDRESSES.find((a) => a.id === address.id);
    if (!known) throw new Error("알 수 없는 예시 주소입니다.");
    address = known;
  } else {
    address = { ...address, provenance: "public_api" };
  }
  const parcel = toParcel(address);
  let land: PropertyLookup["land"];
  let buildings: PropertyLookup["buildings"];
  let trades: PropertyLookup["trades"];
  let landTrades: PropertyLookup["landTrades"] = null;

  if (!parcel) {
    land = noParcel("토지 정보");
    buildings = noParcel("건축물 정보");
    trades = noParcel("거래 사례");
  } else if (mode === "sample") {
    const key = `${parcel.admCd}-${parcel.platGbCd}-${Number(parcel.bun)}-${Number(parcel.ji)}`;
    buildings = sampleBuildings(key);
    land = sampleLand(parcel.pnu);
    trades = sampleHouseTrades(parcel.sigunguCd);
    landTrades = sampleLandTrades(parcel.sigunguCd);
  } else {
    [buildings, land, trades] = await Promise.all([
      getBuildingTitles(parcel),
      getLandCharacteristics(parcel.pnu),
      getHouseTrades(parcel.sigunguCd, recentMonths(12)),
    ]);
    landTrades = null; // 토지 매매 실거래 API는 아직 연동하지 않음
  }

  const lookup: PropertyLookup = {
    id: newId(),
    mode,
    createdAt: new Date().toISOString(),
    address,
    parcel,
    land,
    buildings,
    trades,
    landTrades,
    scope: checkScope(address, buildings),
    targetReasons: targetReasons(buildings),
    mainBuildings: buildings.ok ? buildings.data.filter(isMain) : [],
  };
  getDb()
    .prepare("INSERT INTO property_lookups (id, mode, created_at, payload) VALUES (?, ?, ?, ?)")
    .run(lookup.id, mode, lookup.createdAt, JSON.stringify(lookup));
  return lookup;
}

export function getLookup(id: string): PropertyLookup | null {
  const row = getDb().prepare("SELECT payload FROM property_lookups WHERE id = ?").get(id) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as PropertyLookup) : null;
}
