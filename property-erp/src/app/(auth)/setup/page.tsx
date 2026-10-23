import { redirect } from "next/navigation";
import { setupAction } from "@/app/actions/auth";
import { ActionForm, Input } from "@/components/ui/form";
import { getT } from "@/i18n/server";
import { prisma } from "@/server/db";

export const metadata = { title: "Setup" };

/** التهيئة الأولى: متاحة فقط عندما لا توجد أي منظمة في قاعدة البيانات */
export default async function SetupPage() {
  if ((await prisma.organization.count()) > 0) redirect("/login");
  const { t, L } = await getT();
  if (!process.env.SETUP_TOKEN || process.env.SETUP_TOKEN.length < 16) {
    return (
      <div className="card p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-bold text-navy-900">{t.auth.setupTitle}</h2>
        <p className="text-sm text-muted">
          {L(
            "لأسباب أمنية، أنشئ حساب المدير الأول من سطر الأوامر على الخادم:",
            "For security, create the first administrator from the server command line:",
          )}
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-navy-950 p-3 text-xs text-gold-300" dir="ltr">pnpm admin:create</pre>
        <p className="mt-3 text-xs text-muted">
          {L("أو اضبط متغير SETUP_TOKEN (16 حرفًا على الأقل) لتفعيل التهيئة عبر المتصفح لمرة واحدة.", "Or set SETUP_TOKEN (16+ chars) to enable one-time browser setup.")}
        </p>
      </div>
    );
  }
  return (
    <div className="card p-6 shadow-xl">
      <h2 className="mb-1 text-lg font-bold text-navy-900">{t.auth.setupTitle}</h2>
      <p className="mb-4 text-sm text-muted">{t.auth.setupHint}</p>
      <ActionForm action={setupAction} submitLabel={t.common.create} pendingLabel={t.common.saving} submitClassName="btn-primary w-full">
        <div className="space-y-4">
          <Input name="setupToken" label={L("رمز التهيئة (SETUP_TOKEN)", "Setup token (SETUP_TOKEN)")} type="password" required dir="ltr" autoComplete="off" />
          <Input name="orgName" label={t.auth.orgName} defaultValue="GLOBAL SNOW WING (GSW)" required />
          <Input name="name" label={t.auth.adminName} required />
          <Input name="email" label={t.auth.email} type="email" required dir="ltr" autoComplete="username" />
          <Input name="password" label={t.auth.password} type="password" required dir="ltr" minLength={10} hint={t.auth.passwordHint} autoComplete="new-password" />
          <Input name="password2" label={`${t.auth.password} (2)`} type="password" required dir="ltr" minLength={10} autoComplete="new-password" />
        </div>
      </ActionForm>
    </div>
  );
}
