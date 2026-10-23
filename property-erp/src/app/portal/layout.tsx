import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutAction, toggleLocaleAction } from "@/app/actions/auth";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (ctx.roleKey !== "TENANT") redirect("/");
  const { t } = await getT();
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/portal" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-500 text-xs font-black text-navy-950">GSW</span>
            <span className="text-sm font-bold">{t.nav.portal}</span>
          </Link>
          <span className="flex-1" />
          <form action={toggleLocaleAction}><button className="rounded-lg px-2 py-1 text-sm text-gold-300 hover:bg-white/10">{t.common.language}</button></form>
          <form action={logoutAction}><button className="rounded-lg p-2 hover:bg-white/10" aria-label={t.common.logout}><LogOut size={18} className="rtl:rotate-180" /></button></form>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
