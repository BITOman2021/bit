import { Checkbox, Input, MoneyInput, Select } from "@/components/ui/form";
import type { Dict } from "@/i18n/dict";

export function CostLinkFields({ t, L, props, units, vendors, workOrders, cats, v = {} }: {
  t: Dict;
  L: (a: string, e: string) => string;
  props: { value: string; label: string }[];
  units: { value: string; label: string }[];
  vendors: { value: string; label: string }[];
  workOrders: { value: string; label: string }[];
  cats: { value: string; label: string }[];
  v?: Record<string, string | undefined>;
}) {
  return (
    <>
      <Select name="categoryId" label={t.common.category} options={cats} required placeholder={t.common.select} defaultValue={v.categoryId} />
      <Input name="description" label={t.common.description} required defaultValue={v.description} className="sm:col-span-2" />
      <MoneyInput name="amount" label={L("المبلغ قبل الضريبة", "Amount before tax")} required defaultValue={v.amount} />
      <MoneyInput name="taxAmount" label={L("الضريبة (إن وجدت ومستحقة)", "Tax (if applicable)")} defaultValue="0" />
      <Select name="propertyId" label={L("العقار / مركز التكلفة", "Property / cost center")} options={props} placeholder={t.common.none} defaultValue={v.propertyId} />
      <Select name="unitId" label={t.common.unit} options={units} placeholder={t.common.none} defaultValue={v.unitId} />
      <Select name="vendorId" label={t.common.vendor} options={vendors} placeholder={t.common.none} defaultValue={v.vendorId} />
      <Select name="workOrderId" label={L("أمر العمل", "Work order")} options={workOrders} placeholder={t.common.none} defaultValue={v.workOrderId} />
      <Checkbox name="isCapital" label={L("مصروف رأسمالي (يُرسمل كأصل)", "Capital expenditure (capitalised)")} hint={L("وفق السياسة المحاسبية المعتمدة", "Per the approved accounting policy")} />
    </>
  );
}
