import { describe, expect, it } from "vitest";
import { parseDataGoKr } from "@/lib/providers/dataGoKr";
import { parseVworldLand } from "@/lib/providers/vworld";
import { classifyJusoError, mapJuso } from "@/lib/providers/juso";
import { mapTrade, recentMonths } from "@/lib/providers/rtms";
import { mapBuilding } from "@/lib/providers/buildingHub";
import { redactUrl } from "@/lib/providers/http";
import { checkScope, targetReasons, toParcel } from "@/lib/analysis/scope";
import { SAMPLE_ADDRESSES, sampleBuildings, sampleSearch } from "@/lib/providers/sample";
import { estimateFromHouseComps, estimateFromLandComps } from "@/lib/estimation/comps";
import { estimateDemolition } from "@/lib/estimation/costs";
import type { TradeRecord } from "@/lib/domain/property";

// 2026-10-21 잘못된 키로 실제 호출해 받은 응답 본문
const GW_JSON = `{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR","returnAuthMsg":"등록되지 않은 서비스키","returnReasonCode":"30"}}}`;
const GW_XML = `<?xml version="1.0" encoding="UTF-8"?><OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</errMsg><returnAuthMsg>등록되지 않은 서비스키</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
const VW_ERR = `{"landCharacteristicss" : {"resultCode" : "INVALID_KEY", "resultMsg" : "등록되지 않은 인증키입니다."}}`;

describe("공공데이터포털 응답 해석", () => {
  it("인증 오류(JSON·XML)", () => {
    for (const body of [GW_JSON, GW_XML]) {
      const r = parseDataGoKr(body, 403, "t");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("auth");
    }
  });
  it("호출 제한(22)", () => {
    const r = parseDataGoKr(GW_JSON.replace('"30"', '"22"'), 200, "t");
    expect(!r.ok && r.error.kind).toBe("rate_limit");
  });
  it("정상 + 단건 item, 결과 없음(items 빈 문자열)", () => {
    const one = parseDataGoKr(`{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE"},"body":{"items":{"item":{"mainPurpsCdNm":"단독주택"}},"totalCount":1}}}`, 200, "t");
    expect(one.ok && one.value.items.length).toBe(1);
    const none = parseDataGoKr(`{"response":{"header":{"resultCode":"00"},"body":{"items":"","totalCount":0}}}`, 200, "t");
    expect(none.ok && none.value.items.length).toBe(0);
  });
  it("XML 정상 응답(실거래가)", () => {
    const xml = `<response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header><body><items><item><dealAmount>  85,000</dealAmount><plottageAr>165.2</plottageAr><totalFloorAr>120</totalFloorAr><dealYear>2026</dealYear><dealMonth>3</dealMonth><dealDay>7</dealDay><umdNm>예시동</umdNm><jibun>1**</jibun><buildYear>1988</buildYear><cdealType></cdealType><dealingGbn>중개거래</dealingGbn></item><item><dealAmount>70,000</dealAmount><cdealType>O</cdealType><dealYear>2026</dealYear><dealMonth>4</dealMonth><dealDay>1</dealDay></item></items><totalCount>2</totalCount></body></response>`;
    const r = parseDataGoKr<Record<string, unknown>>(xml, 200, "t");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const t = r.value.items.map(mapTrade);
      expect(t[0].amountWon).toBe(850_000_000);
      expect(t[0].dealDate).toBe("2026-03-07");
      expect(t[0].cancelled).toBe(false);
      expect(t[1].cancelled).toBe(true);
      expect(t[1].landArea).toBeNull(); // 누락 필드는 0이 아니라 null
    }
  });
  it("응답 형식이 아니면 parse 오류", () => {
    const r = parseDataGoKr("not json", 500, "t");
    expect(!r.ok && r.error.kind).toBe("parse");
  });
});

describe("브이월드·주소 API 해석", () => {
  it("브이월드 인증 오류", () => {
    const r = parseVworldLand(VW_ERR);
    expect(!r.ok && r.error.kind).toBe("auth");
  });
  it("브이월드 최신 기준연도 선택 + 누락 필드 표시", () => {
    const r = parseVworldLand(JSON.stringify({ landCharacteristicss: { field: [{ pnu: "1", stdrYear: "2024", lndpclAr: "100" }, { pnu: "1", stdrYear: "2026", lndpclAr: "100", pblntfPclnd: "" }] } }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.stdrYear).toBe("2026");
      expect(r.meta.missingFields).toContain("pblntfPclnd");
    }
  });
  it("브이월드 결과 없음", () => {
    const r = parseVworldLand(JSON.stringify({ landCharacteristicss: { field: [] } }));
    expect(!r.ok && r.error.kind).toBe("no_result");
  });
  it("주소 API 오류코드 구분", () => {
    expect(classifyJusoError("E0001")).toBe("auth");
    expect(classifyJusoError("E0014")).toBe("auth");
    expect(classifyJusoError("E0005")).toBe("invalid_request");
    expect(classifyJusoError("-999")).toBe("upstream");
  });
  it("주소 → 필지 식별자", () => {
    const a = mapJuso({ admCd: "1111010100", mtYn: "1", lnbrMnnm: "12", lnbrSlno: "3", bdKdcd: "0" });
    const p = toParcel(a)!;
    expect(p.pnu).toBe("1111010100200120003");
    expect(p.sigunguCd).toBe("11110");
    expect(p.bjdongCd).toBe("10100");
    expect(p.platGbCd).toBe("1");
  });
  it("인증키는 로그용 URL에서 가린다", () => {
    expect(redactUrl("https://x.kr/a?serviceKey=SECRET&b=1")).not.toContain("SECRET");
    expect(redactUrl("https://x.kr/a?confmKey=SECRET")).not.toContain("SECRET");
  });
  it("건축물 필드 매핑: 빈 값은 null", () => {
    const b = mapBuilding({ totArea: "", mainPurpsCdNm: "단독주택", grndFlrCnt: "2" });
    expect(b.totArea).toBeNull();
    expect(b.grndFlrCnt).toBe(2);
  });
  it("조회 월 목록", () => {
    expect(recentMonths(3, new Date(2026, 0, 15))).toEqual(["202512", "202511", "202510"]);
  });
});

describe("지원 범위·분석 대상", () => {
  it("공동주택 호실은 지원 범위 밖", () => {
    const apt = SAMPLE_ADDRESSES.find((a) => a.id === "sample-apt")!;
    expect(checkScope(apt, sampleBuildings("9999910100-0-300-0")).status).toBe("unsupported");
  });
  it("근린생활시설 등 다른 용도는 지원 범위 밖", () => {
    const house = SAMPLE_ADDRESSES[0];
    const b = sampleBuildings("9999910100-0-101-3");
    if (!b.ok) throw new Error("sample missing");
    const r = checkScope(house, { ...b, data: [{ ...b.data[0], mainPurpsCd: "03000", mainPurpsCdNm: "제1종근린생활시설" }] });
    expect(r.status).toBe("unsupported");
  });
  it("건축물 조회 실패면 '확인 필요'(지원으로 단정하지 않음)", () => {
    expect(checkScope(SAMPLE_ADDRESSES[0], { ok: false, error: { kind: "network", source: "t", message: "x" } }).status).toBe("unconfirmed");
  });
  it("한 지번에 주건축물 2개 → 분석 대상 확인", () => {
    expect(targetReasons(sampleBuildings("9999910200-0-33-1")).length).toBe(2);
  });
  it("예시 검색은 예시 데이터로만 표시", () => {
    const r = sampleSearch("아무거나");
    expect(r.ok && r.meta.provenance).toBe("sample");
  });
});

describe("비교 사례와 비용 추정", () => {
  const base: TradeRecord = { kind: "house", sggCd: "1", umdNm: "가동", houseType: "단독", jibunPartial: null, landArea: 100, floorArea: 100, dealDate: "2026-01-01", amountWon: 500_000_000, buildYear: 1990, cancelled: false, dealingGbn: "중개거래" };
  it("해제·직거래·면적 차이 제외, 사례 부족 시 보류", () => {
    const trades = [base, { ...base, cancelled: true }, { ...base, dealingGbn: "직거래" }, { ...base, landArea: 300 }];
    const r = estimateFromHouseComps({ landArea: 100, floorArea: 100, buildYear: 1990, umdNm: "가동" }, trades);
    expect(r.range).toBeNull();
    expect(r.withheldReason).toContain("미만");
    expect(r.decisions.filter((d) => !d.included).map((d) => d.reason)).toEqual(["해제된 거래", "직거래", "대지면적 차이 큼(3.00배)"]);
  });
  it("분위수 × 대상 면적", () => {
    const trades = [4, 5, 6].map((m) => ({ ...base, amountWon: m * 100_000_000 }));
    const r = estimateFromHouseComps({ landArea: 200, floorArea: 150, buildYear: 1990, umdNm: "가동" }, trades);
    expect(r.range).toEqual({ low: 900_000_000, base: 1_000_000_000, high: 1_100_000_000 });
  });
  it("토지 거래 자료가 없으면 철거 후 토지 매각가 산정 보류", () => {
    expect(estimateFromLandComps({ landArea: 100, floorArea: 100, buildYear: 1990, umdNm: "가동" }, null).range).toBeNull();
  });
  it("철거비: 연면적 없으면 보류, 있으면 항목별 합계", () => {
    expect(estimateDemolition(null).total).toBeNull();
    const d = estimateDemolition(100);
    const sum = d.lines.reduce((a, l) => a + l.amount.base, 0);
    expect(d.total!.base).toBe(sum);
    expect(d.lines.every((l) => l.source && l.asOf && l.region)).toBe(true);
  });
});
