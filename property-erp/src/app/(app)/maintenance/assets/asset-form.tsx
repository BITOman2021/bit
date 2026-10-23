import { Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import type { Dict } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { fmtDate } from "@/lib/format";

export function AssetFields({ t, L, o, a = {} }: { t: Dict; L: (x: string, y: string) => string; o: { props: { value: string; label: string }[]; units: { value: string; label: string }[] }; a?: Record<string, unknown> }) {
  const s = (k: string) => (a[k] == null ? undefined : a[k] instanceof Date ? fmtDate(a[k] as Date) : String(a[k]));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Input name="tag" label={L("الرقم التعريفي", "Asset tag")} defaultValue={s("tag")} dir="ltr" hint={L("يُولّد تلقائيًا", "Auto")} />
      <Input name="name" label={t.common.name} defaultValue={s("name")} required />
      <Select name="category" label={t.common.category} options={enumOptions(t, "MaintenanceCategory")} defaultValue={s("category")} required />
      <Select name="propertyId" label={t.common.property} options={o.props} defaultValue={s("propertyId")} required placeholder={t.common.select} />
      <Select name="unitId" label={t.common.unit} options={o.units} defaultValue={s("unitId")} placeholder={t.common.none} />
      <Input name="location" label={L("الموقع", "Location")} defaultValue={s("location")} />
      <Input name="brand" label={L("الماركة", "Brand")} defaultValue={s("brand")} />
      <Input name="model" label={L("الموديل", "Model")} defaultValue={s("model")} />
      <Input name="serialNumber" label={L("الرقم التسلسلي", "Serial number")} defaultValue={s("serialNumber")} dir="ltr" />
      <Input name="installDate" type="date" label={L("تاريخ التركيب", "Install date")} defaultValue={s("installDate")} />
      <Input name="warrantyEnd" type="date" label={L("انتهاء الضمان", "Warranty end")} defaultValue={s("warrantyEnd")} />
      <MoneyInput name="purchaseCost" label={L("تكلفة الشراء", "Purchase cost")} defaultValue={s("purchaseCost")} />
      <Select name="status" label={t.common.status} options={[{ value: "ACTIVE", label: L("يعمل", "Active") }, { value: "UNDER_REPAIR", label: L("تحت الإصلاح", "Under repair") }, { value: "RETIRED", label: L("خارج الخدمة", "Retired") }]} defaultValue={s("status")} />
      <Textarea name="notes" label={t.common.notes} defaultValue={s("notes")} className="lg:col-span-2" />
    </div>
  );
}
