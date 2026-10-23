import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { recordPaymentAction } from "@/app/actions/ops";
import { ActionForm, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, Empty, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { listBankAccounts } from "@/server/services/banking";
import { getTenant, listTenants } from "@/server/services/tenants";
import { load, sp, type SP } from "../../../_lib/guard";

export default async function NewPayment({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("payment.write")) redirect("/forbidden");
  const { t, L } = await getT();
  const q = await sp(searchParams);
  if (!q.tenantId) {
    const tenants = await listTenants(ctx, { status: "all" });
    return (
      <>
        <PageHeader title={L("تسجيل تحصيل", "Record collection")} back={{ href: "/finance/payments", label: t.nav.payments }} />
        <Card title={L("اختر المستأجر", "Select tenant")}>
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="label" htmlFor="tenantId">{t.common.tenant}</label>
              <select id="tenantId" name="tenantId" className="input" required>
                <option value="">{t.common.select}</option>
                {tenants.map((tn) => <option key={tn.id} value={tn.id}>{tn.name} ({tn.code})</option>)}
              </select>
            </div>
            <button className="btn-primary">{t.common.apply}</button>
          </form>
        </Card>
      </>
    );
  }
  const tenant = await load(getTenant(ctx, q.tenantId));
  const charges = await prisma.leaseCharge.findMany({
    where: { status: { in: ["OPEN", "PARTIAL"] }, lease: { tenantId: tenant.id, id: q.leaseId || undefined, status: { in: ["ACTIVE", "EXPIRED", "TERMINATED"] } } },
    include: { lease: { select: { number: true } } },
    orderBy: { dueDate: "asc" },
    take: 60,
  });
  const banks = await listBankAccounts(ctx);
  const today = todayInZone(ctx.timezone);
  const overdue = charges.filter((c) => c.dueDate <= today).reduce((a, c) => a + toBaisa(c.amount) - toBaisa(c.paidAmount), 0n);
  return (
    <>
      <PageHeader title={L("تسجيل تحصيل", "Record collection")} subtitle={tenant.name} back={{ href: `/tenants/${tenant.id}`, label: tenant.name }} />
      <ActionForm action={recordPaymentAction} submitLabel={L("تسجيل وإصدار إيصال", "Record & issue receipt")} pendingLabel={t.common.saving} submitClassName="btn-gold">
        {/* مفتاح منع التكرار: يُولّد مرة واحدة لكل عرض للنموذج */}
        <input type="hidden" name="idempotencyKey" value={randomUUID()} />
        <input type="hidden" name="tenantId" value={tenant.id} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card title={L("بيانات التحصيل", "Collection details")} className="lg:col-span-1">
            <div className="space-y-3">
              <Select name="leaseId" label={t.nav.leases} options={tenant.leases.filter((l) => l.status !== "DRAFT" && l.status !== "CANCELLED").map((l) => ({ value: l.id, label: `${l.number} — ${l.unit.unitNumber}` }))} defaultValue={q.leaseId} placeholder={L("كل العقود", "All leases")} />
              <MoneyInput name="amount" label={L("المبلغ المستلم (ر.ع.)", "Amount received (OMR)")} required defaultValue={overdue > 0n ? (Number(overdue) / 1000).toFixed(3) : undefined} />
              <Input name="receivedDate" type="date" label={L("تاريخ التحصيل", "Date received")} defaultValue={fmtDate(today)} max={fmtDate(today)} required />
              <Select name="method" label={L("طريقة الدفع", "Method")} options={enumOptions(t, "PaymentMethod")} defaultValue="BANK_TRANSFER" />
              <Select name="bankAccountId" label={L("الحساب البنكي", "Bank account")} options={banks.map((b) => ({ value: b.id, label: b.name }))} placeholder={L("حسب طريقة الدفع", "By method")} />
              <Input name="reference" label={L("المرجع (رقم الشيك/التحويل)", "Reference (cheque/transfer no.)")} />
              <Textarea name="notes" label={t.common.notes} />
            </div>
          </Card>
          <Card title={L("الاستحقاقات المفتوحة (اختياري: حدد للتخصيص اليدوي)", "Open charges (optional: select to allocate manually)")} className="lg:col-span-2">
            {charges.length === 0 ? (
              <Empty title={L("لا توجد استحقاقات مفتوحة — سيُسجل المبلغ رصيدًا دائنًا", "No open charges — amount will be held as credit")} />
            ) : (
              <>
                <Alert>{L("إذا لم تحدد أي استحقاق، يوزّع المبلغ تلقائيًا على الأقدم استحقاقًا أولًا. المتبقي يبقى رصيدًا دائنًا للمستأجر.", "If none selected, the amount is applied oldest-first. Any remainder stays as tenant credit.")}</Alert>
                <ul className="mt-3 divide-y divide-line">
                  {charges.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 py-2 text-sm hover:bg-navy-50">
                        <input type="checkbox" name="chargeIds[]" value={c.id} className="h-5 w-5 accent-navy-900" />
                        <span className="num w-24 text-xs">{fmtDate(c.dueDate)}</span>
                        <span className="flex-1">{label(t, "ChargeType", c.type)} · <span className="num text-xs text-muted">{c.number} / {c.lease.number}</span></span>
                        <Money value={toBaisa(c.amount) - toBaisa(c.paidAmount)} className={c.dueDate < today ? "font-bold text-danger" : ""} />
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm">{L("المستحق حتى اليوم", "Due to date")}: <Money value={overdue} currency /></p>
              </>
            )}
          </Card>
        </div>
      </ActionForm>
    </>
  );
}
