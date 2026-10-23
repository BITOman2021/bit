import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import type { Dict } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { fmtDate } from "@/lib/format";

type P = Partial<Record<string, unknown>>;
const s = (v: unknown) => (v === null || v === undefined ? undefined : typeof v === "object" && v instanceof Date ? fmtDate(v) : String(v));

export function PropertyFields({ t, L, p = {} }: { t: Dict; L: (a: string, e: string) => string; p?: P }) {
  return (
    <div className="space-y-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-gold-700">{L("البيانات الأساسية", "Basic information")}</legend>
        <Input name="code" label={L("رقم العقار", "Property code")} defaultValue={s(p.code)} hint={L("يُولّد تلقائيًا إذا تُرك فارغًا", "Auto-generated if empty")} dir="ltr" />
        <Input name="name" label={t.common.name} defaultValue={s(p.name)} required />
        <Select name="type" label={t.common.type} options={enumOptions(t, "PropertyType")} defaultValue={s(p.type)} required />
        <Select name="status" label={t.common.status} options={enumOptions(t, "PropertyStatus")} defaultValue={s(p.status) ?? "ACTIVE"} />
        <Input name="governorate" label={L("المحافظة", "Governorate")} defaultValue={s(p.governorate)} />
        <Input name="wilayat" label={L("الولاية", "Wilayat")} defaultValue={s(p.wilayat)} />
        <Input name="area" label={L("المنطقة", "Area")} defaultValue={s(p.area)} />
        <Input name="address" label={t.common.address} defaultValue={s(p.address)} className="sm:col-span-2" />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-gold-700">{L("المعلومات العقارية", "Land registry information")}</legend>
        <Input name="plotNumber" label={L("رقم القطعة", "Plot number")} defaultValue={s(p.plotNumber)} dir="ltr" />
        <Input name="krookiNumber" label={L("رقم الكروكي / المخطط", "Krooki / sketch no.")} defaultValue={s(p.krookiNumber)} dir="ltr" />
        <Input name="landArea" label={L("مساحة الأرض (م²)", "Land area (m²)")} defaultValue={s(p.landArea)} inputMode="decimal" dir="ltr" />
        <Input name="builtArea" label={L("مساحة البناء (م²)", "Built area (m²)")} defaultValue={s(p.builtArea)} inputMode="decimal" dir="ltr" />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-gold-700">{L("الشراء والتقييم والتمويل", "Purchase, valuation and financing")}</legend>
        <Input name="purchaseDate" type="date" label={L("تاريخ الشراء", "Purchase date")} defaultValue={s(p.purchaseDate)} />
        <MoneyInput name="purchasePrice" label={L("قيمة الشراء (ر.ع.)", "Purchase price (OMR)")} defaultValue={s(p.purchasePrice)} />
        <MoneyInput name="estimatedValue" label={L("القيمة التقديرية (ر.ع.)", "Estimated value (OMR)")} defaultValue={s(p.estimatedValue)} />
        <Input name="valuationDate" type="date" label={L("تاريخ التقييم", "Valuation date")} defaultValue={s(p.valuationDate)} />
        <Textarea name="financingDetails" label={L("بيانات التمويل", "Financing details")} defaultValue={s(p.financingDetails)} className="sm:col-span-2" />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-gold-700">{L("التأمين", "Insurance")}</legend>
        <Input name="insuranceProvider" label={L("شركة التأمين", "Insurer")} defaultValue={s(p.insuranceProvider)} />
        <Input name="insurancePolicyNo" label={L("رقم الوثيقة", "Policy number")} defaultValue={s(p.insurancePolicyNo)} dir="ltr" />
        <Input name="insuranceExpiry" type="date" label={L("تاريخ الانتهاء", "Expiry date")} defaultValue={s(p.insuranceExpiry)} />
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Checkbox name="ownershipSplitEnabled" label={L("توزيع الإيرادات والمصروفات حسب نسب الملكية", "Split income & expenses by ownership share")} defaultChecked={!!p.ownershipSplitEnabled} />
        <Textarea name="notes" label={L("ملاحظات داخلية", "Internal notes")} defaultValue={s(p.notes)} />
      </div>
    </div>
  );
}
