import { type Baisa, min } from "./money";

export interface OpenCharge {
  id: string;
  dueDate: Date;
  amount: Baisa;
  paid: Baisa;
  type?: string;
}

export interface AllocationResult {
  allocations: { chargeId: string; amount: Baisa }[];
  unallocated: Baisa;
}

/**
 * توزيع دفعة على الاستحقاقات المفتوحة: الأقدم استحقاقًا أولًا (FIFO).
 * يمكن تمرير قائمة محددة من الاستحقاقات بالترتيب المطلوب.
 * المتبقي يبقى رصيدًا دائنًا للمستأجر (غير مخصص).
 */
export function allocateFifo(amount: Baisa, charges: OpenCharge[], opts: { preserveOrder?: boolean } = {}): AllocationResult {
  if (amount <= 0n) throw new Error("Payment amount must be positive");
  const ordered = opts.preserveOrder
    ? charges
    : [...charges].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id.localeCompare(b.id));
  let remaining = amount;
  const allocations: { chargeId: string; amount: Baisa }[] = [];
  for (const c of ordered) {
    if (remaining <= 0n) break;
    const balance = c.amount - c.paid;
    if (balance <= 0n) continue;
    const take = min(balance, remaining);
    allocations.push({ chargeId: c.id, amount: take });
    remaining -= take;
  }
  return { allocations, unallocated: remaining };
}

export function chargeStatus(amount: Baisa, paid: Baisa): "OPEN" | "PARTIAL" | "PAID" {
  if (paid <= 0n) return "OPEN";
  if (paid >= amount) return "PAID";
  return "PARTIAL";
}
