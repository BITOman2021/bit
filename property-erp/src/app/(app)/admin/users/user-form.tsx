import { Checkbox, Input, Select } from "@/components/ui/form";
import type { Dict } from "@/i18n/dict";

export function UserFields({ t, L, roles, props, tenants, owners, u, isNew, locale }: {
  t: Dict;
  L: (a: string, e: string) => string;
  roles: { id: string; nameAr: string; nameEn: string; key: string }[];
  props: { id: string; code: string; name: string }[];
  tenants: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  u?: { email: string; name: string; phone: string | null; roleId: string; propertyScope: string; locale: string; isActive: boolean; propertyAccess: { propertyId: string }[]; tenant: { id?: string } | null; owner: { id?: string } | null; tenantId?: string; ownerId?: string };
  isNew: boolean;
  locale: "ar" | "en";
}) {
  const access = new Set(u?.propertyAccess.map((a) => a.propertyId) ?? []);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input name="name" label={t.common.name} defaultValue={u?.name} required />
        <Input name="email" type="email" label={t.common.email} defaultValue={u?.email} required dir="ltr" />
        <Input name="phone" label={t.common.phone} defaultValue={u?.phone ?? undefined} dir="ltr" />
        <Select name="roleId" label={L("الدور", "Role")} options={roles.map((r) => ({ value: r.id, label: locale === "ar" ? r.nameAr : r.nameEn }))} defaultValue={u?.roleId} required />
        <Select name="propertyScope" label={L("نطاق العقارات", "Property scope")} options={[{ value: "RESTRICTED", label: L("عقارات محددة", "Selected properties") }, { value: "ALL", label: L("كل العقارات", "All properties") }]} defaultValue={u?.propertyScope ?? "RESTRICTED"} />
        <Select name="locale" label={L("اللغة", "Language")} options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]} defaultValue={u?.locale ?? "ar"} />
        <Select name="tenantId" label={L("ملف المستأجر (لدور المستأجر)", "Tenant profile (tenant role)")} options={tenants.map((x) => ({ value: x.id, label: x.name }))} defaultValue={u?.tenantId} placeholder={t.common.none} />
        <Select name="ownerId" label={L("ملف المالك (لدور المالك)", "Owner profile (owner role)")} options={owners.map((x) => ({ value: x.id, label: x.name }))} defaultValue={u?.ownerId} placeholder={t.common.none} />
        <Input name="password" type="password" label={isNew ? t.auth.password : L("كلمة مرور جديدة (اختياري)", "New password (optional)")} required={isNew} dir="ltr" minLength={10} hint={t.auth.passwordHint} autoComplete="new-password" />
      </div>
      <fieldset>
        <legend className="label">{L("العقارات المسموح بها (عند النطاق المحدد)", "Allowed properties (restricted scope)")}</legend>
        <div className="flex flex-wrap gap-2">
          {props.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-[:checked]:border-navy-700 has-[:checked]:bg-navy-50">
              <input type="checkbox" name="propertyIds" value={p.id} defaultChecked={access.has(p.id)} className="accent-navy-900" />
              {p.code} {p.name}
            </label>
          ))}
        </div>
      </fieldset>
      <Checkbox name="isActive" label={L("الحساب نشط", "Account active")} defaultChecked={u?.isActive ?? true} />
    </div>
  );
}
