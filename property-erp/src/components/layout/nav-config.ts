import type { Ctx } from "@/server/context";
import type { Dict } from "@/i18n/dict";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function buildNav(ctx: Ctx, t: Dict, counts: { approvals: number }): NavGroup[] {
  const has = (p: string) => ctx.permissions.has(p);
  const g = (label: string | undefined, items: (NavItem | false)[]): NavGroup => ({ label, items: items.filter(Boolean) as NavItem[] });
  const groups: NavGroup[] = [
    g(undefined, [
      has("dashboard.view") && { href: "/", label: t.nav.dashboard, icon: "dashboard" },
      has("approval.decide") && { href: "/approvals", label: t.nav.approvals, icon: "approvals", badge: counts.approvals },
      has("task.write") && { href: "/tasks", label: t.nav.tasks, icon: "tasks" },
    ]),
    g(t.nav.properties, [
      has("property.read") && { href: "/properties", label: t.nav.properties, icon: "building" },
      has("property.read") && { href: "/units", label: t.nav.units, icon: "door" },
      has("owner.read") && { href: "/owners", label: t.nav.owners, icon: "owner" },
      has("tenant.read") && { href: "/tenants", label: t.nav.tenants, icon: "users" },
      has("lease.read") && { href: "/leases", label: t.nav.leases, icon: "lease" },
    ]),
    g(t.nav.finance, [
      has("finance.read") && { href: "/finance/payments", label: t.nav.payments, icon: "receipt" },
      has("finance.read") && { href: "/finance/arrears", label: t.nav.arrears, icon: "hourglass" },
      has("finance.read") && { href: "/finance/deposits", label: t.nav.deposits, icon: "piggy" },
      has("finance.read") && { href: "/finance/expenses", label: t.nav.expenses, icon: "wallet" },
      has("finance.read") && { href: "/finance/invoices", label: t.nav.invoices, icon: "banknote" },
      has("journal.read") && { href: "/finance/journal", label: t.nav.journal, icon: "book" },
      has("journal.read") && { href: "/finance/accounts", label: t.nav.accounts, icon: "list" },
      has("bank.reconcile") && { href: "/finance/bank", label: t.nav.bank, icon: "bank" },
    ]),
    g(t.nav.maintenance, [
      has("maintenance.read") && { href: "/maintenance/requests", label: t.nav.requests, icon: "wrench" },
      (has("maintenance.read") || has("workorder.assigned")) && { href: "/maintenance/work-orders", label: t.nav.workOrders, icon: "hardhat" },
      has("maintenance.read") && { href: "/maintenance/schedules", label: t.nav.schedules, icon: "calendar" },
      has("maintenance.read") && { href: "/maintenance/assets", label: t.nav.assets, icon: "boxes" },
      has("vendor.read") && { href: "/vendors", label: t.nav.vendors, icon: "truck" },
      has("vendor.read") && { href: "/purchase-orders", label: t.nav.purchaseOrders, icon: "package" },
    ]),
    g(undefined, [
      has("document.read") && { href: "/documents", label: t.nav.documents, icon: "folder" },
      has("report.read") && { href: "/reports", label: t.nav.reports, icon: "chart" },
      has("report.read") && { href: "/assistant", label: t.nav.assistant, icon: "sparkles" },
    ]),
    g(t.nav.admin, [
      has("user.manage") && { href: "/admin/users", label: t.nav.users, icon: "usercog" },
      has("user.manage") && { href: "/admin/roles", label: t.nav.roles, icon: "shield" },
      has("audit.read") && { href: "/admin/audit", label: t.nav.audit, icon: "scroll" },
      has("settings.manage") && { href: "/admin/settings", label: t.nav.settings, icon: "settings" },
      has("settings.manage") && { href: "/admin/system", label: t.nav.system, icon: "clock" },
    ]),
  ];
  return groups.filter((x) => x.items.length > 0);
}
