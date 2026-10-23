import { Input, Select, Textarea } from "@/components/ui/form";
import type { Dict } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { fmtDate } from "@/lib/format";

export function TenantFields({ t, L, v = {}, canSensitive }: { t: Dict; L: (a: string, e: string) => string; v?: Record<string, unknown>; canSensitive: boolean }) {
  const s = (k: string) => (v[k] == null ? undefined : v[k] instanceof Date ? fmtDate(v[k] as Date) : String(v[k]));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input name="code" label={t.common.code} defaultValue={s("code")} dir="ltr" hint={L("يُولّد تلقائيًا", "Auto")} />
        <Input name="name" label={t.common.name} defaultValue={s("name")} required />
        <Select name="type" label={t.common.type} options={enumOptions(t, "TenantType")} defaultValue={s("type")} />
        <Input name="phone" label={t.common.phone} defaultValue={s("phone")} type="tel" dir="ltr" />
        <Input name="email" label={t.common.email} defaultValue={s("email")} type="email" dir="ltr" />
        <Input name="nationality" label={L("الجنسية", "Nationality")} defaultValue={s("nationality")} />
        <Input name="address" label={t.common.address} defaultValue={s("address")} />
        <Input name="employer" label={L("جهة العمل", "Employer")} defaultValue={s("employer")} />
        <Input name="emergencyContact" label={L("جهة اتصال للطوارئ", "Emergency contact")} defaultValue={s("emergencyContact")} />
      </div>
      <fieldset className="grid grid-cols-1 gap-4 rounded-lg border border-gold-300 bg-gold-100/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-1 text-sm font-bold text-gold-700">{L("بيانات الهوية (حساسة)", "Identity (sensitive)")}</legend>
        <Input name="idType" label={L("نوع الهوية", "ID type")} defaultValue={s("idType")} />
        {canSensitive ? (
          <Input name="idNumber" label={L("رقم الهوية", "ID number")} defaultValue={s("idNumber")} dir="ltr" autoComplete="off" />
        ) : (
          <Input name="idNumberMasked" label={L("رقم الهوية", "ID number")} defaultValue={s("idNumber")} disabled hint={L("لا تملك صلاحية التعديل", "No permission")} />
        )}
        <Input name="idExpiry" type="date" label={L("انتهاء الهوية", "ID expiry")} defaultValue={s("idExpiry")} />
        <Input name="crNumber" label={L("السجل التجاري", "CR number")} defaultValue={s("crNumber")} dir="ltr" />
      </fieldset>
      <Textarea name="notes" label={t.common.notes} defaultValue={s("notes")} />
    </div>
  );
}
