import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate, fmtMoney } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { getLease, renderTemplate } from "@/server/services/leases";
import { getSettings } from "@/server/services/settings";
import { load } from "@/app/(app)/_lib/guard";
import { Letterhead } from "../../letterhead";

export default async function PrintLease({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L } = await getT();
  const l = await load(getLease(ctx, id));
  const s = await getSettings(ctx.orgId);
  const tpl = l.templateId ? await prisma.leaseTemplate.findFirst({ where: { id: l.templateId, organizationId: ctx.orgId } }) : null;
  await audit(prisma, ctx, { action: "lease.print", entityType: "Lease", entityId: id, summary: l.number });
  const vars: Record<string, string> = {
    "lease.number": l.number,
    "lease.startDate": fmtDate(l.startDate),
    "lease.endDate": fmtDate(l.endDate),
    "lease.monthlyRent": fmtMoney(l.monthlyRent),
    "lease.frequency": label(t, "RentFrequency", l.frequency),
    "lease.depositAmount": fmtMoney(l.depositAmount),
    "tenant.name": l.tenant.name,
    "tenant.idNumber": ctx.permissions.has("tenant.sensitive") || ctx.tenantId === l.tenantId ? (l.tenant.idNumber ?? "") : "••••",
    "tenant.phone": l.tenant.phone ?? "",
    "unit.number": l.unit.unitNumber,
    "property.name": l.unit.property.name,
    "property.address": l.unit.property.address ?? "",
    "company.name": s["company.nameAr"],
    today: fmtDate(todayInZone(ctx.timezone)),
  };
  const rows: [string, string][] = [
    [L("المؤجر", "Lessor"), `${s["company.nameAr"]} / ${s["company.nameEn"]}`],
    [L("المستأجر", "Tenant"), l.tenant.name],
    [L("العقار / الوحدة", "Property / unit"), `${l.unit.property.name} — ${l.unit.unitNumber}`],
    [L("العنوان", "Address"), l.unit.property.address ?? "—"],
    [L("مدة العقد", "Term"), `${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}`],
    [L("الإيجار الشهري", "Monthly rent"), `${fmtMoney(l.monthlyRent)} OMR`],
    [L("تكرار الاستحقاق", "Frequency"), label(t, "RentFrequency", l.frequency)],
    [L("طريقة الدفع", "Payment method"), label(t, "PaymentMethod", l.paymentMethod)],
    [L("مبلغ التأمين", "Security deposit"), `${fmtMoney(l.depositAmount)} OMR`],
    [L("فترة السماح", "Grace period"), `${l.gracePeriodDays} ${L("يوم", "days")}`],
  ];
  return (
    <article className="text-sm leading-7">
      <Letterhead s={s} title={L("عقد إيجار", "Lease agreement")} number={l.number} />
      {l.status === "DRAFT" && <p className="mb-4 rounded border-2 border-dashed border-danger p-2 text-center font-bold text-danger">{L("مسودة — غير معتمدة", "DRAFT — not approved")}</p>}
      {tpl && !tpl.isApproved && <p className="mb-4 rounded border border-warning p-2 text-center text-warning">{L("القالب المستخدم غير معتمد قانونيًا بعد", "Template not yet legally approved")}</p>}
      <table className="mb-6 w-full border-collapse">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line">
              <th className="w-1/3 bg-navy-50 p-2 text-start font-semibold">{k}</th>
              <td className="p-2">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tpl ? (
        <section className="whitespace-pre-wrap">{renderTemplate(tpl.body, vars)}</section>
      ) : (
        <section className="space-y-3">
          {l.depositTerms && <p><b>{L("شروط التأمين: ", "Deposit terms: ")}</b>{l.depositTerms}</p>}
          {l.renewalTerms && <p><b>{L("شروط التجديد: ", "Renewal: ")}</b>{l.renewalTerms}</p>}
          {l.terminationTerms && <p><b>{L("شروط الإنهاء: ", "Termination: ")}</b>{l.terminationTerms}</p>}
          {l.specialTerms && <p><b>{L("شروط خاصة: ", "Special terms: ")}</b>{l.specialTerms}</p>}
        </section>
      )}
      <h3 className="mb-2 mt-6 font-bold">{L("جدول الاستحقاقات", "Payment schedule")}</h3>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-navy-50">
            <th className="border border-line p-1">#</th>
            <th className="border border-line p-1">{L("تاريخ الاستحقاق", "Due")}</th>
            <th className="border border-line p-1">{t.common.type}</th>
            <th className="border border-line p-1">{t.common.amount}</th>
          </tr>
        </thead>
        <tbody>
          {l.charges.filter((c) => c.status !== "VOID").map((c, i) => (
            <tr key={c.id}>
              <td className="border border-line p-1 text-center num">{i + 1}</td>
              <td className="border border-line p-1 num">{fmtDate(c.dueDate)}</td>
              <td className="border border-line p-1">{label(t, "ChargeType", c.type)}</td>
              <td className="border border-line p-1 text-end num">{fmtMoney(c.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-16 grid grid-cols-2 gap-10 text-center">
        <div className="border-t border-ink pt-2">{L("توقيع المؤجر", "Lessor signature")}</div>
        <div className="border-t border-ink pt-2">{L("توقيع المستأجر", "Tenant signature")}</div>
      </div>
      <p className="mt-8 text-[10px] text-muted">{L("لا يوجد توقيع إلكتروني معتمد مدمج في النظام؛ التوقيع يتم يدويًا أو عبر وسيلة معتمدة خارجية.", "No certified e-signature is integrated; sign manually or via an approved external service.")}</p>
    </article>
  );
}
