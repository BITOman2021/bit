import { redirect } from "next/navigation";
import { logoutAction, toggleLocaleAction } from "@/app/actions/auth";
import { buildNav } from "@/components/layout/nav-config";
import { AppShell } from "@/components/layout/shell";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { prisma } from "@/server/db";
import { unreadCount } from "@/server/services/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  if (ctx.roleKey === "TENANT") redirect("/portal");
  const { t, locale } = await getT();
  const [unread, approvals, role] = await Promise.all([
    unreadCount(ctx),
    ctx.permissions.has("approval.decide") ? prisma.approval.count({ where: { organizationId: ctx.orgId, status: "PENDING", requestedById: { not: ctx.userId } } }) : 0,
    prisma.role.findFirst({ where: { organizationId: ctx.orgId, key: ctx.roleKey } }),
  ]);
  const nav = buildNav(ctx, t, { approvals });
  const mobile = ctx.roleKey === "TECHNICIAN" ? ["/maintenance/work-orders"] : ["/", "/properties", "/leases", ctx.permissions.has("finance.read") ? "/finance/payments" : "/maintenance/requests"];
  return (
    <AppShell
      nav={nav}
      user={{ name: ctx.userName, role: (locale === "ar" ? role?.nameAr : role?.nameEn) ?? ctx.roleKey }}
      unread={unread}
      logoutAction={logoutAction}
      toggleLocaleAction={toggleLocaleAction}
      mobileItems={mobile}
      labels={{
        logout: t.common.logout,
        language: t.common.language,
        notifications: t.nav.notifications,
        more: t.nav.more,
        collapse: t.common.collapse,
        offline: t.common.offline,
        account: t.nav.account,
        appName: t.app.name,
        company: t.app.company,
      }}
    >
      {children}
    </AppShell>
  );
}
