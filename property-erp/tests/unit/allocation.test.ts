import { describe, expect, it } from "vitest";
import { allocateFifo, chargeStatus } from "@/lib/allocation";
import { parseDateOnly as d } from "@/lib/dates";
import { toBaisa as b } from "@/lib/money";

const charges = [
  { id: "c2", dueDate: d("2026-02-01"), amount: b("450"), paid: 0n },
  { id: "c1", dueDate: d("2026-01-01"), amount: b("450"), paid: b("200") },
  { id: "c3", dueDate: d("2026-03-01"), amount: b("450"), paid: 0n },
];

describe("payment allocation", () => {
  it("allocates oldest due first, with partial payments", () => {
    const r = allocateFifo(b("500"), charges);
    expect(r.allocations).toEqual([
      { chargeId: "c1", amount: b("250") },
      { chargeId: "c2", amount: b("250") },
    ]);
    expect(r.unallocated).toBe(0n);
  });

  it("keeps overpayment as unallocated tenant credit", () => {
    const r = allocateFifo(b("2000"), charges);
    expect(r.allocations.reduce((a, x) => a + x.amount, 0n)).toBe(b("1150"));
    expect(r.unallocated).toBe(b("850"));
  });

  it("skips fully paid charges", () => {
    const r = allocateFifo(b("10"), [{ id: "x", dueDate: d("2026-01-01"), amount: b("5"), paid: b("5") }]);
    expect(r.allocations).toEqual([]);
    expect(r.unallocated).toBe(b("10"));
  });

  it("rejects non-positive payments", () => {
    expect(() => allocateFifo(0n, charges)).toThrow();
  });

  it("derives charge status", () => {
    expect(chargeStatus(b("10"), 0n)).toBe("OPEN");
    expect(chargeStatus(b("10"), b("0.001"))).toBe("PARTIAL");
    expect(chargeStatus(b("10"), b("10"))).toBe("PAID");
  });
});
