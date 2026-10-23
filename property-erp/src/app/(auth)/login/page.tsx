import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, Input } from "@/components/ui/form";
import { getT } from "@/i18n/server";
import { getCtx } from "@/server/auth/next";
import { prisma } from "@/server/db";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  if (await getCtx()) redirect("/");
  if ((await prisma.organization.count()) === 0) redirect("/setup");
  const { t, L } = await getT();
  const sp = await searchParams;
  return (
    <div className="card p-6 shadow-xl">
      <h2 className="mb-4 text-lg font-bold text-navy-900">{t.auth.title}</h2>
      {sp.setup && <p className="mb-4 rounded-lg bg-success-bg px-3 py-2 text-sm text-success">{L("تمت التهيئة. سجّل الدخول بحساب المدير.", "Setup complete. Sign in with the administrator account.")}</p>}
      <ActionForm action={loginAction} submitLabel={t.auth.submit} pendingLabel={t.common.loading} submitClassName="btn-primary w-full">
        <div className="space-y-4">
          <Input name="email" label={t.auth.email} type="email" autoComplete="username" required dir="ltr" />
          <Input name="password" label={t.auth.password} type="password" autoComplete="current-password" required dir="ltr" />
        </div>
      </ActionForm>
    </div>
  );
}
