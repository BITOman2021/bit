import { redirect } from "next/navigation";
import { createPoAction } from "@/app/actions/ops";
import { ActionForm, Input, Select, Textarea } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { todayInZone } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listProperties } from "@/server/services/properties";
import { listVendors } from "@/server/services/purchasing";

export default async function NewPo() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("vendor.write")) redirect("/forbidden");
  const { t, L } = await getT();
  const [vendors, props] = await Promise.all([listVendors(ctx), listProperties(ctx)]);
  return (
    <>
      <PageHeader title={L("أمر شراء جديد", "New purchase order")} back={{ href: "/purchase-orders", label: t.nav.purchaseOrders }} />
      <Card>
        <ActionForm action={createPoAction} submitLabel={t.common.create}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Select name="vendorId" label={t.common.vendor} options={vendors.map((v) => ({ value: v.id, label: v.name }))} required placeholder={t.common.select} />
            <Select name="propertyId" label={L("العقار / مركز التكلفة", "Property / cost center")} options={props.map((p) => ({ value: p.id, label: p.name }))} placeholder={t.common.none} />
            <Input name="date" type="date" label={t.common.date} defaultValue={fmtDate(todayInZone(ctx.timezone))} required />
            <Input name="expectedDate" type="date" label={L("التوريد المتوقع", "Expected delivery")} />
          </div>
          <p className="mb-2 mt-4 text-sm font-semibold">{L("البنود", "Lines")}</p>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="mb-2 grid grid-cols-6 gap-2">
              <input name="lineDesc[]" className="input col-span-3" placeholder={t.common.description} aria-label={t.common.description} />
              <input name="lineQty[]" className="input" placeholder={L("الكمية", "Qty")} inputMode="decimal" dir="ltr" aria-label={L("الكمية", "Qty")} />
              <input name="linePrice[]" className="input col-span-2" placeholder={L("سعر الوحدة", "Unit price")} inputMode="decimal" dir="ltr" aria-label={L("سعر الوحدة", "Unit price")} />
            </div>
          ))}
          <Textarea name="notes" label={t.common.notes} />
        </ActionForm>
      </Card>
    </>
  );
}
