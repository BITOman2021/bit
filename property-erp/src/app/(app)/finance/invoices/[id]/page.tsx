import { randomUUID } from "node:crypto";
import Link from "next/link";
import { payInvoiceAction, voidInvoiceAction } from "@/app/actions/ops";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { ActionButton, ActionForm, Input, MoneyInput, Select } from "@/components/ui/form";
import { Badge, Card, DescList, Grid, Money, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { toBaisa } from "@/lib/money";
import { requireCtx } from "@/server/auth/next";
import { listBankAccounts } from "@/server/services/banking";
import { getInvoice } from "@/server/services/purchasing";
import { load } from "../../../_lib/guard";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L, locale } = await getT();
  const inv = await load(getInvoice(ctx, id));
  const banks = await listBankAccounts(ctx);
  const balance = toBaisa(inv.total) - toBaisa(inv.paidAmount);
  return (
    <>
      <PageHeader
        title={`${L("فاتورة مورد", "Vendor bill")} ${inv.number}`}
        subtitle={<Badge status={inv.status}>{label(t, "DocumentStatus", inv.status)}</Badge>}
        back={{ href: "/finance/invoices", label: t.nav.invoices }}
        actions={ctx.permissions.has("invoice.write") && balance === toBaisa(inv.total) && inv.status !== "VOID" && <ActionButton action={voidInvoiceAction} fields={{ id }} label={t.common.void} className="btn-danger btn-sm" askReason={t.common.reason} />}
      />
      <Grid cols={2}>
        <Card title={t.common.details}>
          <DescList
            items={[
              { label: t.common.vendor, value: <Link className="link" href={`/vendors/${inv.vendorId}`}>{inv.vendor.name}</Link> },
              { label: L("رقم فاتورة المورد", "Vendor invoice no."), value: <span className="num">{inv.vendorInvoiceNo}</span> },
              { label: t.common.date, value: <span className="num">{fmtDate(inv.date)}</span> },
              { label: L("الاستحقاق", "Due"), value: <span className="num">{fmtDate(inv.dueDate)}</span> },
              { label: t.common.category, value: (locale === "ar" ? inv.category.nameAr : inv.category.nameEn) + (inv.isCapital ? " (CAPEX)" : "") },
              { label: t.common.description, value: inv.description },
              { label: t.common.amount, value: <Money value={inv.amount} currency /> },
              { label: L("الضريبة", "Tax"), value: <Money value={inv.taxAmount} currency /> },
              { label: t.common.total, value: <Money value={inv.total} currency /> },
              { label: L("المدفوع / المتبقي", "Paid / balance"), value: <><Money value={inv.paidAmount} /> / <Money value={balance} className="font-bold" /></> },
              { label: L("أمر العمل", "Work order"), value: inv.workOrder ? <Link className="link" href={`/maintenance/work-orders/${inv.workOrder.id}`}>{inv.workOrder.number}</Link> : "—" },
              { label: L("القيد", "Entry"), value: inv.journalEntry ? <Link className="link num" href={`/finance/journal/${inv.journalEntry.id}`}>{inv.journalEntry.number}</Link> : "—" },
            ]}
          />
        </Card>
        <Card title={L("الدفعات", "Payments")}>
          <ul className="mb-4 space-y-1 text-sm">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex justify-between"><span className="num">{p.number} · {fmtDate(p.date)}</span><Money value={p.amount} /></li>
            ))}
          </ul>
          {["POSTED", "PARTIALLY_PAID"].includes(inv.status) && ctx.permissions.has("invoice.write") && (
            <ActionForm action={payInvoiceAction} submitLabel={L("تسجيل دفعة للمورد", "Record vendor payment")} submitClassName="btn-gold">
              <input type="hidden" name="invoiceId" value={id} />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MoneyInput name="amount" label={t.common.amount} defaultValue={(Number(balance) / 1000).toFixed(3)} required />
                <Input name="date" type="date" label={t.common.date} defaultValue={fmtDate(todayInZone(ctx.timezone))} required />
                <Select name="method" label={L("الطريقة", "Method")} options={enumOptions(t, "PaymentMethod")} defaultValue="BANK_TRANSFER" />
                <Select name="bankAccountId" label={L("الحساب البنكي", "Bank")} options={banks.map((b) => ({ value: b.id, label: b.name }))} placeholder={L("حسب الطريقة", "By method")} />
                <Input name="reference" label={t.common.reference} />
              </div>
            </ActionForm>
          )}
          {inv.status === "PENDING_APPROVAL" && <p className="text-sm text-warning">{L("بانتظار الاعتماد قبل الترحيل والسداد", "Awaiting approval before posting and payment")}</p>}
        </Card>
      </Grid>
      <div className="mt-4">
        <DocumentsPanel ctx={ctx} t={t} L={L} where={{ vendorId: inv.vendorId, category: "INVOICE" }} link={{ vendorId: inv.vendorId, ...(inv.propertyId ? { propertyId: inv.propertyId } : {}) }} categories={["INVOICE", "RECEIPT", "QUOTATION", "WARRANTY"]} />
      </div>
    </>
  );
}
