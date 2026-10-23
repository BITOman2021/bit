import Link from "next/link";
import { applyCreditAction, requestRefundAction, voidPaymentAction } from "@/app/actions/ops";
import { ActionButton, ActionForm, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, DataTable, DescList, Grid, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { getPayment } from "@/server/services/billing";
import { load, sp, type SP } from "../../../_lib/guard";

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const q = await sp(searchParams);
  const { t, L } = await getT();
  const p = await load(getPayment(ctx, id));
  const credit = toBaisa(p.unallocated);
  return (
    <>
      <PageHeader
        title={`${L("إيصال", "Receipt")} ${p.receipt?.number ?? p.number}`}
        subtitle={<Badge status={p.status}>{label(t, "PaymentStatus", p.status)}</Badge>}
        back={{ href: "/finance/payments", label: t.nav.payments }}
        actions={
          <>
            <Link className="btn-primary" href={`/print/receipt/${id}`} target="_blank">{t.common.print}</Link>
            {p.status === "POSTED" && credit > 0n && ctx.permissions.has("payment.write") && <ActionButton action={applyCreditAction} fields={{ id }} label={L("تطبيق الرصيد الدائن", "Apply credit")} />}
            {p.status === "POSTED" && ctx.permissions.has("payment.void") && <ActionButton action={voidPaymentAction} fields={{ id }} label={t.common.void} className="btn-danger btn-sm" askReason={L("سبب الإلغاء (مثل: شيك مرتجع)", "Void reason (e.g. bounced cheque)")} />}
          </>
        }
      />
      {q.ok && <div className="mb-4"><Alert tone="success">{L("تم تسجيل التحصيل وإصدار الإيصال وترحيل القيد.", "Collection recorded, receipt issued and entry posted.")}</Alert></div>}
      {p.status === "VOIDED" && <div className="mb-4"><Alert tone="danger">{L("ملغاة", "Voided")}: {p.voidReason}</Alert></div>}
      <Grid cols={2}>
        <Card title={t.common.details}>
          <DescList
            items={[
              { label: t.common.tenant, value: <Link className="link" href={`/tenants/${p.tenantId}`}>{p.tenant.name}</Link> },
              { label: t.common.amount, value: <Money value={p.amount} currency /> },
              { label: L("تاريخ التحصيل", "Received"), value: <span className="num">{fmtDate(p.receivedDate)}</span> },
              { label: L("الطريقة", "Method"), value: label(t, "PaymentMethod", p.method) },
              { label: t.common.reference, value: p.reference },
              { label: L("الحساب البنكي", "Bank"), value: p.bankAccount?.name },
              { label: L("رصيد غير مخصص", "Unallocated"), value: <Money value={p.unallocated} currency /> },
              { label: L("رقم العملية", "Transaction"), value: <span className="num">{p.number}</span> },
            ]}
          />
        </Card>
        <Card title={L("القيد المحاسبي", "Journal entry")}>
          {p.journalEntry && (
            <>
              <Link className="link num text-sm" href={`/finance/journal/${p.journalEntry.id}`}>{p.journalEntry.number}</Link>
              <table className="dtable mt-2">
                <thead><tr><th>{L("الحساب", "Account")}</th><th className="text-end">{L("مدين", "Dr")}</th><th className="text-end">{L("دائن", "Cr")}</th></tr></thead>
                <tbody>
                  {p.journalEntry.lines.map((l) => (
                    <tr key={l.id}><td>{l.account.code} {l.account.nameAr}</td><td className="text-end"><Money value={l.debit} /></td><td className="text-end"><Money value={l.credit} /></td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </Grid>
      <Card title={L("التخصيص على الاستحقاقات", "Allocations")} className="mt-4" bodyClassName="p-0">
        <DataTable
          rows={p.allocations}
          rowKey={(a) => a.id}
          cols={[
            { key: "c", label: L("الاستحقاق", "Charge"), primary: true, render: (a) => <span className="num">{a.charge.number}</span> },
            { key: "t", label: t.common.type, render: (a) => label(t, "ChargeType", a.charge.type) },
            { key: "d", label: L("الاستحقاق", "Due"), render: (a) => <span className="num">{fmtDate(a.charge.dueDate)}</span> },
            { key: "a", label: t.common.amount, align: "end", render: (a) => <Money value={a.amount} /> },
            { key: "s", label: t.common.status, render: (a) => (a.reversedAt ? <Badge tone="gray">{L("معكوس", "Reversed")}</Badge> : <Badge tone="green">✓</Badge>) },
          ]}
        />
      </Card>
      {p.status === "POSTED" && credit > 0n && ctx.permissions.has("refund.write") && (
        <Card title={L("طلب رد المبلغ الزائد", "Request overpayment refund")} className="mt-4">
          <ActionForm action={requestRefundAction} submitLabel={L("إرسال للاعتماد", "Send for approval")}>
            <input type="hidden" name="kind" value="OVERPAYMENT_REFUND" />
            <input type="hidden" name="paymentId" value={id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <MoneyInput name="amount" label={t.common.amount} defaultValue={(Number(credit) / 1000).toFixed(3)} required />
              <Input name="date" type="date" label={t.common.date} defaultValue={fmtDate(todayInZone(ctx.timezone))} required />
              <Select name="method" label={L("الطريقة", "Method")} options={enumOptions(t, "PaymentMethod")} defaultValue="BANK_TRANSFER" />
              <Textarea name="reason" label={t.common.reason} required />
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
