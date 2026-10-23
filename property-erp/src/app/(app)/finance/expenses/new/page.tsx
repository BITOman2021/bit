import { redirect } from "next/navigation";
import { createExpenseAction } from "@/app/actions/ops";
import { ActionForm, Input, Select } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listBankAccounts } from "@/server/services/banking";
import { sp, type SP } from "../../../_lib/guard";
import { costOptions } from "../../cost-options";
import { CostLinkFields } from "../../expense-fields";

export default async function NewExpense({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("expense.write")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const q = await sp(searchParams);
  const [opts, banks] = await Promise.all([costOptions(ctx, locale), listBankAccounts(ctx)]);
  return (
    <>
      <PageHeader title={L("مصروف مدفوع", "Paid expense")} subtitle={L("للمصروفات المدفوعة مباشرة. فواتير الموردين الآجلة تُسجل من «فواتير الموردين».", "For directly paid expenses. Credit vendor bills go under Vendor bills.")} back={{ href: "/finance/expenses", label: t.nav.expenses }} />
      <Card>
        <ActionForm action={createExpenseAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input name="date" type="date" label={t.common.date} defaultValue={fmtDate(todayInZone(ctx.timezone))} required />
            <CostLinkFields t={t} L={L} {...opts} v={{ propertyId: q.propertyId, workOrderId: q.workOrderId, vendorId: q.vendorId }} />
            <Select name="paymentMethod" label={L("طريقة الدفع", "Payment method")} options={enumOptions(t, "PaymentMethod")} defaultValue="BANK_TRANSFER" />
            <Select name="bankAccountId" label={L("الحساب البنكي", "Bank account")} options={banks.map((b) => ({ value: b.id, label: b.name }))} placeholder={L("حسب طريقة الدفع", "By method")} />
            <Input name="reference" label={L("المرجع / رقم الفاتورة", "Reference / invoice no.")} />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
