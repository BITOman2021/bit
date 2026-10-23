import { Input, Select, Textarea } from "@/components/ui/form";
import type { Dict } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";

export function OwnerFields({ t, L, o = {} }: { t: Dict; L: (a: string, e: string) => string; o?: Record<string, unknown> }) {
  const s = (k: string) => (o[k] == null ? undefined : String(o[k]));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Input name="code" label={t.common.code} defaultValue={s("code")} dir="ltr" hint={L("يُولّد تلقائيًا إذا تُرك فارغًا", "Auto if empty")} />
      <Input name="name" label={t.common.name} defaultValue={s("name")} required />
      <Select name="type" label={t.common.type} options={enumOptions(t, "OwnerType")} defaultValue={s("type")} />
      <Input name="nationalId" label={L("الرقم المدني", "Civil ID")} defaultValue={s("nationalId")} dir="ltr" />
      <Input name="crNumber" label={L("السجل التجاري", "CR number")} defaultValue={s("crNumber")} dir="ltr" />
      <Input name="phone" label={t.common.phone} defaultValue={s("phone")} type="tel" dir="ltr" />
      <Input name="email" label={t.common.email} defaultValue={s("email")} type="email" dir="ltr" />
      <Input name="address" label={t.common.address} defaultValue={s("address")} />
      <Input name="bankDetails" label={L("البيانات البنكية", "Bank details")} defaultValue={s("bankDetails")} />
      <Textarea name="notes" label={t.common.notes} defaultValue={s("notes")} className="sm:col-span-2 lg:col-span-3" />
    </div>
  );
}
