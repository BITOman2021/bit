import { Input, Textarea } from "@/components/ui/form";
import type { Dict } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { fmtDate } from "@/lib/format";

export function VendorFields({ t, L, v = {} }: { t: Dict; L: (a: string, e: string) => string; v?: Record<string, unknown> }) {
  const s = (k: string) => (v[k] == null ? undefined : v[k] instanceof Date ? fmtDate(v[k] as Date) : String(v[k]));
  const specs = (v.specialties as string[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input name="code" label={t.common.code} defaultValue={s("code")} dir="ltr" hint={L("يُولّد تلقائيًا", "Auto")} />
        <Input name="name" label={t.common.name} defaultValue={s("name")} required />
        <Input name="contactPerson" label={L("الشخص المسؤول", "Contact person")} defaultValue={s("contactPerson")} />
        <Input name="phone" label={t.common.phone} defaultValue={s("phone")} type="tel" dir="ltr" />
        <Input name="email" label={t.common.email} defaultValue={s("email")} type="email" dir="ltr" />
        <Input name="address" label={t.common.address} defaultValue={s("address")} />
        <Input name="crNumber" label={L("السجل التجاري", "CR number")} defaultValue={s("crNumber")} dir="ltr" />
        <Input name="licenseNumber" label={L("رقم الترخيص", "License no.")} defaultValue={s("licenseNumber")} dir="ltr" />
        <Input name="licenseExpiry" type="date" label={L("انتهاء الترخيص", "License expiry")} defaultValue={s("licenseExpiry")} />
        <Input name="vatNumber" label={L("الرقم الضريبي", "VAT number")} defaultValue={s("vatNumber")} dir="ltr" />
        <Input name="bankDetails" label={L("البيانات البنكية", "Bank details")} defaultValue={s("bankDetails")} />
      </div>
      <fieldset>
        <legend className="label">{L("التخصصات", "Specialties")}</legend>
        <div className="flex flex-wrap gap-2">
          {enumOptions(t, "MaintenanceCategory").map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-navy-700 has-[:checked]:bg-navy-50">
              <input type="checkbox" name="specialties" value={o.value} defaultChecked={specs.includes(o.value)} className="accent-navy-900" />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Textarea name="notes" label={t.common.notes} defaultValue={s("notes")} />
    </div>
  );
}
