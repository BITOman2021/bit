import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { fmtDate, fmtMoney } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getPayment } from "@/server/services/billing";
import { getSettings } from "@/server/services/settings";
import { load } from "@/app/(app)/_lib/guard";
import { Letterhead } from "../../letterhead";

export default async function PrintReceipt({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L } = await getT();
  const p = await load(getPayment(ctx, id));
  const s = await getSettings(ctx.orgId);
  return (
    <article className="text-sm leading-7">
      <Letterhead s={s} title={L("إيصال استلام", "Receipt")} number={p.receipt?.number ?? p.number} />
      {p.status === "VOIDED" && <p className="mb-4 rounded border-2 border-danger p-2 text-center text-lg font-black text-danger">{L("ملغى", "VOID")} — {p.voidReason}</p>}
      <table className="mb-6 w-full border-collapse">
        <tbody>
          {([
            [L("استلمنا من", "Received from"), p.tenant.name],
            [L("مبلغ وقدره", "Amount"), `${fmtMoney(p.amount)} OMR`],
            [L("تاريخ الاستلام", "Date received"), fmtDate(p.receivedDate)],
            [L("طريقة الدفع", "Method"), `${label(t, "PaymentMethod", p.method)}${p.reference ? ` — ${p.reference}` : ""}`],
            [L("العقد / الوحدة", "Lease / unit"), p.lease ? `${p.lease.number} — ${p.lease.unit.property.name} / ${p.lease.unit.unitNumber}` : "—"],
            [L("رقم العملية", "Transaction"), p.number],
          ] as [string, string][]).map(([k, v]) => (
            <tr key={k} className="border-b border-line">
              <th className="w-1/3 bg-navy-50 p-2 text-start">{k}</th>
              <td className="p-2 num">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mb-2 font-bold">{L("التخصيص على الاستحقاقات", "Applied to")}</h3>
      <table className="w-full border-collapse text-xs">
        <thead><tr className="bg-navy-50"><th className="border border-line p-1">{L("الاستحقاق", "Charge")}</th><th className="border border-line p-1">{L("تاريخ الاستحقاق", "Due")}</th><th className="border border-line p-1">{t.common.amount}</th></tr></thead>
        <tbody>
          {p.allocations.filter((a) => !a.reversedAt).map((a) => (
            <tr key={a.id}>
              <td className="border border-line p-1 num">{a.charge.number} ({label(t, "ChargeType", a.charge.type)})</td>
              <td className="border border-line p-1 num">{fmtDate(a.charge.dueDate)}</td>
              <td className="border border-line p-1 text-end num">{fmtMoney(a.amount)}</td>
            </tr>
          ))}
          {Number(p.unallocated) > 0 && (
            <tr><td colSpan={2} className="border border-line p-1">{L("رصيد دائن غير مخصص", "Unallocated credit")}</td><td className="border border-line p-1 text-end num">{fmtMoney(p.unallocated)}</td></tr>
          )}
        </tbody>
      </table>
      <div className="mt-16 grid grid-cols-2 gap-10 text-center">
        <div className="border-t border-ink pt-2">{L("المستلم", "Received by")}</div>
        <div className="border-t border-ink pt-2">{L("الختم", "Stamp")}</div>
      </div>
      <p className="mt-6 text-[10px] text-muted">{L("هذا الإيصال صادر آليًا من النظام ويثبت استلام المبلغ المذكور فقط.", "System-generated receipt confirming receipt of the stated amount only.")}</p>
    </article>
  );
}
