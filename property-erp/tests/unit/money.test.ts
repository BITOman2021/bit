import { describe, expect, it } from "vitest";
import { allocateByWeights, divRoundHalfUp, formatOMR, fromBaisa, MoneyError, percentOf, sum, toBaisa } from "@/lib/money";

describe("money: parsing and formatting", () => {
  it("parses OMR strings exactly to baisa", () => {
    expect(toBaisa("0.001")).toBe(1n);
    expect(toBaisa("1234.5")).toBe(1234500n);
    expect(toBaisa("1,250.750")).toBe(1250750n);
    expect(toBaisa("-3.25")).toBe(-3250n);
    expect(toBaisa("")).toBe(0n);
  });

  it("avoids floating point errors (0.1 + 0.2)", () => {
    expect(fromBaisa(toBaisa("0.1") + toBaisa("0.2"))).toBe("0.300");
    expect(fromBaisa(toBaisa(0.1) + toBaisa(0.2))).toBe("0.300");
  });

  it("rejects more than 3 decimals unless rounding is requested", () => {
    expect(() => toBaisa("1.2345")).toThrow(MoneyError);
    expect(toBaisa("1.2345", { round: true })).toBe(1235n);
    expect(toBaisa("1.2344", { round: true })).toBe(1234n);
    expect(toBaisa("-1.2345", { round: true })).toBe(-1235n);
  });

  it("rejects garbage", () => {
    expect(() => toBaisa("abc")).toThrow(MoneyError);
    expect(() => toBaisa("1.2.3")).toThrow(MoneyError);
    expect(() => toBaisa(Number.NaN)).toThrow(MoneyError);
  });

  it("formats with three decimals and grouping", () => {
    expect(formatOMR(1234567890n)).toBe("1,234,567.890");
    expect(formatOMR("-5")).toBe("-5.000");
    expect(formatOMR(5n, { withCurrency: true })).toBe("OMR 0.005");
    expect(formatOMR("12.5", { withCurrency: true, locale: "ar" })).toBe("12.500 ر.ع.");
  });
});

describe("money: rounding policy (half-up, away from zero)", () => {
  it("rounds halves up", () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
    expect(divRoundHalfUp(4n, 3n)).toBe(1n);
    expect(divRoundHalfUp(-5n, 2n)).toBe(-3n);
  });

  it("computes VAT 5% with rounding", () => {
    expect(percentOf(toBaisa("100"), "5")).toBe(toBaisa("5"));
    expect(percentOf(toBaisa("0.010"), "5")).toBe(1n); // 0.0005 → 0.001
    expect(percentOf(toBaisa("0.009"), "5")).toBe(0n); // 0.00045 → 0.000
    expect(percentOf(toBaisa("333.333"), "5")).toBe(toBaisa("16.667"));
  });
});

describe("money: ownership distribution (largest remainder)", () => {
  it("splits so the parts always sum to the total", () => {
    const parts = allocateByWeights(toBaisa("100"), ["33.3333", "33.3333", "33.3334"]);
    expect(sum(parts)).toBe(toBaisa("100"));
    expect(parts.map(fromBaisa)).toEqual(["33.333", "33.333", "33.334"]);
  });

  it("handles 1 baisa across three owners", () => {
    const parts = allocateByWeights(1n, ["1", "1", "1"]);
    expect(sum(parts)).toBe(1n);
    expect(parts).toEqual([1n, 0n, 0n]);
  });

  it("handles 50/50 of an odd amount", () => {
    const parts = allocateByWeights(toBaisa("0.003"), ["50", "50"]);
    expect(sum(parts)).toBe(3n);
  });

  it("handles negative amounts (net loss)", () => {
    const parts = allocateByWeights(toBaisa("-10"), ["60", "40"]);
    expect(parts.map(fromBaisa)).toEqual(["-6.000", "-4.000"]);
  });

  it("rejects zero weights", () => {
    expect(() => allocateByWeights(10n, ["0", "0"])).toThrow();
  });
});
