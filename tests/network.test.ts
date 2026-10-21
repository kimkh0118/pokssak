// 실제 공공 API에 "잘못된 인증키"로 호출해 오류 분류를 확인한다(정상 키 없이 가능한 범위).
// 네트워크가 필요하므로 RUN_NETWORK_TESTS=1 일 때만 실행: RUN_NETWORK_TESTS=1 npm test
import { beforeAll, describe, expect, it } from "vitest";
import { searchJuso } from "@/lib/providers/juso";
import { getBuildingTitles } from "@/lib/providers/buildingHub";
import { getLandCharacteristics } from "@/lib/providers/vworld";
import { getHouseTrades } from "@/lib/providers/rtms";

describe.skipIf(!process.env.RUN_NETWORK_TESTS)("실제 API 인증 오류 처리(잘못된 키)", () => {
  beforeAll(() => {
    process.env.JUSO_API_KEY = "INVALID_TEST_KEY";
    process.env.DATA_GO_KR_SERVICE_KEY = "INVALID_TEST_KEY";
    process.env.VWORLD_API_KEY = "INVALID_TEST_KEY";
  });
  const parcel = { admCd: "1111010100", sigunguCd: "11110", bjdongCd: "10100", platGbCd: "0" as const, bun: "0001", ji: "0000", pnu: "1111010100100010000" };

  it("주소 검색", async () => {
    const r = await searchJuso("세종대로 110");
    expect(!r.ok && r.error.kind).toBe("auth");
  }, 20_000);
  it("건축물대장", async () => {
    const r = await getBuildingTitles(parcel);
    expect(!r.ok && r.error.kind).toBe("auth");
    if (!r.ok) expect(r.error.message).not.toContain("INVALID_TEST_KEY");
  }, 20_000);
  it("토지특성", async () => {
    const r = await getLandCharacteristics(parcel.pnu);
    expect(!r.ok && r.error.kind).toBe("auth");
  }, 20_000);
  it("실거래가(인증 오류는 부분 결과로 숨기지 않음)", async () => {
    const r = await getHouseTrades("11110", ["202601", "202602"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("auth");
  }, 20_000);
});
