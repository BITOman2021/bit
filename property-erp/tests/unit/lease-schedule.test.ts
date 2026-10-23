import { describe, expect, it } from "vitest";
import { parseDateOnly as d, formatDateOnly as f, addMonths } from "@/lib/dates";
import { generateRentSchedule } from "@/lib/lease-schedule";
import { fromBaisa, sum, toBaisa } from "@/lib/money";

describe("dates", () => {
  it("adds months clamping end of month", () => {
    expect(f(addMonths(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(f(addMonths(d("2028-01-31"), 1))).toBe("2028-02-29");
    expect(f(addMonths(d("2026-11-15"), 3))).toBe("2027-02-15");
  });
  it("rejects invalid dates", () => {
    expect(() => d("2026-02-30")).toThrow();
  });
});

describe("rent schedule", () => {
  it("one-year monthly lease → 12 equal charges", () => {
    const s = generateRentSchedule({ startDate: d("2026-01-01"), endDate: d("2026-12-31"), monthlyRent: toBaisa("450"), frequency: "MONTHLY" });
    expect(s).toHaveLength(12);
    expect(s.every((p) => p.amount === toBaisa("450"))).toBe(true);
    expect(f(s[11].periodStart)).toBe("2026-12-01");
    expect(f(s[11].periodEnd)).toBe("2026-12-31");
    expect(sum(s.map((p) => p.amount))).toBe(toBaisa("5400"));
  });

  it("quarterly lease starting mid-month", () => {
    const s = generateRentSchedule({ startDate: d("2026-03-15"), endDate: d("2027-03-14"), monthlyRent: toBaisa("300"), frequency: "QUARTERLY" });
    expect(s).toHaveLength(4);
    expect(s.map((p) => f(p.dueDate))).toEqual(["2026-03-15", "2026-06-15", "2026-09-15", "2026-12-15"]);
    expect(s.every((p) => p.amount === toBaisa("900"))).toBe(true);
  });

  it("prorates a final partial month by days", () => {
    // 1 Jan → 15 Feb: January full + 15/28 of February
    const s = generateRentSchedule({ startDate: d("2026-01-01"), endDate: d("2026-02-15"), monthlyRent: toBaisa("280"), frequency: "MONTHLY" });
    expect(s).toHaveLength(2);
    expect(fromBaisa(s[1].amount)).toBe("150.000");
    expect(s[1].extraDays).toBe(15);
  });

  it("rounds prorated fractions to the baisa (half-up)", () => {
    // 10 days of 31-day month at 100 OMR = 32.258064... → 32.258
    const s = generateRentSchedule({ startDate: d("2026-01-01"), endDate: d("2026-01-10"), monthlyRent: toBaisa("100"), frequency: "MONTHLY" });
    expect(fromBaisa(s[0].amount)).toBe("32.258");
  });

  it("annual lease with partial year", () => {
    const s = generateRentSchedule({ startDate: d("2026-01-01"), endDate: d("2027-06-30"), monthlyRent: toBaisa("1000"), frequency: "ANNUAL" });
    expect(s).toHaveLength(2);
    expect(fromBaisa(s[0].amount)).toBe("12000.000");
    expect(fromBaisa(s[1].amount)).toBe("6000.000");
  });

  it("applies VAT separately from net", () => {
    const s = generateRentSchedule({ startDate: d("2026-01-01"), endDate: d("2026-01-31"), monthlyRent: toBaisa("333.333"), frequency: "MONTHLY", vatRate: "5" });
    expect(fromBaisa(s[0].netAmount)).toBe("333.333");
    expect(fromBaisa(s[0].taxAmount)).toBe("16.667");
    expect(fromBaisa(s[0].amount)).toBe("350.000");
  });

  it("lease starting on the 31st does not drift", () => {
    const s = generateRentSchedule({ startDate: d("2026-01-31"), endDate: d("2026-05-30"), monthlyRent: toBaisa("100"), frequency: "MONTHLY" });
    expect(s.map((p) => f(p.dueDate))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(s.every((p) => p.amount === toBaisa("100"))).toBe(true);
  });

  it("rejects end before start", () => {
    expect(() => generateRentSchedule({ startDate: d("2026-02-01"), endDate: d("2026-01-01"), monthlyRent: 1n, frequency: "MONTHLY" })).toThrow();
  });
});
