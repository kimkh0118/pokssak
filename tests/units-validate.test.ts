import { describe, expect, it } from "vitest";
import { formatWon, manwonToWon, parseDealAmountManwonToWon, parseNumberOrNull, pyeongToSqm, sqmToPyeong, wonToManwon, perPyeongToPerSqm } from "@/lib/domain/units";
import { validateAnswers, validateMoney, validateOverrides, ValidationError } from "@/lib/analysis/validate";
import { monthsUntil } from "@/lib/analysis/buildInput";

describe("단위 변환", () => {
  it("원·만원", () => {
    expect(manwonToWon(30_000)).toBe(300_000_000);
    expect(wonToManwon(220_000_000)).toBe(22_000);
    expect(manwonToWon(0)).toBe(0);
  });
  it("실거래가 거래금액(만원, 쉼표) → 원", () => {
    expect(parseDealAmountManwonToWon("  85,000")).toBe(850_000_000);
    expect(parseDealAmountManwonToWon("")).toBeNull();
    expect(parseDealAmountManwonToWon(undefined)).toBeNull();
  });
  it("빈 문자열은 0이 아니라 null", () => {
    expect(parseNumberOrNull("")).toBeNull();
    expect(parseNumberOrNull("0")).toBe(0);
  });
  it("평·㎡", () => {
    expect(pyeongToSqm(1)).toBeCloseTo(3.3058, 3);
    expect(sqmToPyeong(165.3)).toBeCloseTo(50.0, 0);
    expect(perPyeongToPerSqm(3_305_785)).toBeCloseTo(1_000_000, -1);
  });
  it("금액 표시", () => {
    expect(formatWon(340_000_000)).toBe("3억 4,000만 원");
    expect(formatWon(-12_345_678)).toBe("-1,235만 원");
    expect(formatWon(null)).toBe("산정 불가");
    expect(formatWon(0)).toBe("0원");
  });
});

describe("입력 검증: 0원과 모름/미입력 구분", () => {
  it("known 0은 0원, unknown/unanswered는 그대로 보존", () => {
    expect(validateMoney({ status: "known", won: 0 }, "x")).toEqual({ status: "known", won: 0 });
    expect(validateMoney({ status: "unknown" }, "x")).toEqual({ status: "unknown" });
    expect(validateMoney(undefined, "x")).toEqual({ status: "unanswered" });
    expect(() => validateMoney({ status: "known", won: -1 }, "x")).toThrow(ValidationError);
  });
  it("임차인 거주가 아니면 임대차 정보를 버린다", () => {
    const a = validateAnswers({ purpose: "live", timing: "flexible", occupancy: "owner", condition: "good", tenant: { deposit: { status: "known", won: 1 } } });
    expect(a.tenant).toBeUndefined();
    expect(a.loanBalance).toEqual({ status: "unanswered" });
  });
  it("잘못된 선택지는 거부", () => {
    expect(() => validateAnswers({ purpose: "x", timing: "flexible", occupancy: "owner", condition: "good" })).toThrow(ValidationError);
  });
  it("계산 조건: 낮음 ≤ 기준 ≤ 높음, 허용 범위", () => {
    expect(() => validateOverrides({ asIsPrice: { low: 3, base: 2, high: 4 } })).toThrow(ValidationError);
    expect(() => validateOverrides({ horizonMonths: 3 })).toThrow(ValidationError);
    expect(validateOverrides({ taxes: { asIsSale: 0 } }).taxes).toEqual({ asIsSale: 0, landSale: null, remodelSale: null });
    expect(validateOverrides({ unknownKey: 1 })).toEqual({});
  });
  it("계약 종료까지 남은 개월", () => {
    expect(monthsUntil("2027-03", new Date(2026, 9, 21))).toBe(5);
    expect(monthsUntil("2020-01", new Date(2026, 9, 21))).toBe(0);
    expect(monthsUntil("bad")).toBeNull();
  });
});
