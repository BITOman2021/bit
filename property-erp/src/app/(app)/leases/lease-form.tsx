import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import type { Dict } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { fmtDate } from "@/lib/format";

export function LeaseFields({
  t,
  L,
  v = {},
  units,
  tenants,
  templates,
  taxEnabled,
}: {
  t: Dict;
  L: (a: string, e: string) => string;
  v?: Record<string, unknown>;
  units: { value: string; label: string }[];
  tenants: { value: string; label: string }[];
  templates: { value: string; label: string }[];
  taxEnabled: boolean;
}) {
  const s = (k: string) => (v[k] == null ? undefined : v[k] instanceof Date ? fmtDate(v[k] as Date) : typeof v[k] === "object" ? String((v[k] as { toFixed?: (n: number) => string }).toFixed?.(3) ?? v[k]) : String(v[k]));
  return (
    <div className="space-y-6">
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-gold-700">{L("الأطراف", "Parties")}</legend>
        <Select name="unitId" label={t.common.unit} options={units} defaultValue={s("unitId")} placeholder={t.common.select} required />
        <Select name="tenantId" label={t.common.tenant} options={tenants} defaultValue={s("tenantId")} placeholder={t.common.select} required />
        <Select name="templateId" label={L("قالب العقد", "Contract template")} options={templates} defaultValue={s("templateId")} placeholder={t.common.none} />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-bold text-gold-700">{L("المدة والإيجار", "Term & rent")}</legend>
        <Input name="startDate" type="date" label={L("تاريخ البداية", "Start date")} defaultValue={s("startDate")} required />
        <Input name="endDate" type="date" label={L("تاريخ النهاية", "End date")} defaultValue={s("endDate")} required />
        <MoneyInput name="monthlyRent" label={L("الإيجار الشهري (ر.ع.)", "Monthly rent (OMR)")} defaultValue={s("monthlyRent")} required />
        <Select name="frequency" label={L("تكرار الاستحقاق", "Billing frequency")} options={enumOptions(t, "RentFrequency")} defaultValue={s("frequency") ?? "MONTHLY"} />
        <Select name="paymentMethod" label={L("طريقة الدفع", "Payment method")} options={enumOptions(t, "PaymentMethod")} defaultValue={s("paymentMethod") ?? "BANK_TRANSFER"} />
        <Input name="vatRate" label={L("نسبة الضريبة %", "VAT rate %")} defaultValue={s("vatRate") ?? "0"} inputMode="decimal" dir="ltr" disabled={!taxEnabled} hint={taxEnabled ? L("تحقق من انطباق الضريبة قبل تطبيقها", "Verify applicability first") : L("الضريبة غير مفعلة في الإعدادات", "Tax disabled in settings")} />
        <Input name="gracePeriodDays" type="number" min={0} label={L("فترة السماح (أيام)", "Grace period (days)")} defaultValue={s("gracePeriodDays") ?? "0"} />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-gold-700">{L("التأمين ورسوم التأخير", "Deposit & late fees")}</legend>
        <MoneyInput name="depositAmount" label={L("مبلغ التأمين (ر.ع.)", "Security deposit (OMR)")} defaultValue={s("depositAmount") ?? "0"} />
        <Textarea name="depositTerms" label={L("شروط رد التأمين", "Deposit refund terms")} defaultValue={s("depositTerms")} className="lg:col-span-2" />
        <Checkbox name="lateFeeEnabled" label={L("ينص العقد على رسوم تأخير", "Lease provides for late fees")} hint={L("لا تُطبق آليًا؛ تتطلب تفعيلها في الإعدادات وإضافتها يدويًا", "Never automatic; must be enabled in settings and added manually")} defaultChecked={v.lateFeeEnabled === true} />
        <MoneyInput name="lateFeeAmount" label={L("مبلغ رسوم التأخير المتفق عليه", "Agreed late fee")} defaultValue={s("lateFeeAmount") ?? "0"} />
      </fieldset>
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-bold text-gold-700">{L("الشروط", "Terms")}</legend>
        <Textarea name="renewalTerms" label={L("شروط التجديد", "Renewal terms")} defaultValue={s("renewalTerms")} />
        <Textarea name="terminationTerms" label={L("شروط الإنهاء", "Termination terms")} defaultValue={s("terminationTerms")} />
        <Textarea name="specialTerms" label={L("شروط خاصة", "Special terms")} defaultValue={s("specialTerms")} />
      </fieldset>
      <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">
        {L(
          "تنبيه: لا يفترض النظام صحة أي بند قانوني. راجع البنود وفق القوانين والإجراءات المعمول بها في سلطنة عُمان قبل الاعتماد.",
          "Note: the system does not assume any clause is legally valid. Review terms against applicable Omani law before approval.",
        )}
      </p>
    </div>
  );
}
