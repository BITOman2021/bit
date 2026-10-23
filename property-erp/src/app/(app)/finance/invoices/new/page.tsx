import { redirect } from "next/navigation";
import { createInvoiceAction } from "@/app/actions/ops";
import { ActionForm, Input, Select } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { addDays, todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listPurchaseOrders } from "@/server/services/purchasing";
import { sp, type SP } from "../../../_lib/guard";
import { costOptions } from "../../cost-options";
import { CostLinkFields } from "../../expense-fields";

export default async function NewInvoice({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("invoice.write")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const q = await sp(searchParams);
  const [opts, pos] = await Promise.all([costOptions(ctx, locale), ctx.permissions.has("vendor.read") ? listPurchaseOrders(ctx) : Promise.resolve([])]);
  const today = todayInZone(ctx.timezone);
  return (
    <>
      <PageHeader title={L("فاتورة مورد جديدة", "New vendor bill")} subtitle={L("تُرحّل على ذمم الموردين؛ والسداد يتم لاحقًا. لا يمكن تسجيل نفس رقم فاتورة المورد مرتين.", "Posted to payables; pay later. The same vendor invoice number cannot be recorded twice.")} back={{ href: "/finance/invoices", label: t.nav.invoices }} />
      <Card>
        <ActionForm action={createInvoiceAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input name="vendorInvoiceNo" label={L("رقم فاتورة المورد", "Vendor invoice no.")} required dir="ltr" />
            <Input name="date" type="date" label={t.common.date} defaultValue={fmtDate(today)} required />
            <Input name="dueDate" type="date" label={L("تاريخ الاستحقاق", "Due date")} defaultValue={fmtDate(addDays(today, 30))} required />
            <CostLinkFields t={t} L={L} {...opts} v={{ vendorId: q.vendorId, workOrderId: q.workOrderId, propertyId: q.propertyId }} />
            <Select name="purchaseOrderId" label={L("أمر الشراء", "Purchase order")} options={pos.filter((p) => p.status === "APPROVED").map((p) => ({ value: p.id, label: `${p.number} — ${p.vendor.name}` }))} placeholder={t.common.none} />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
