import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Badge, Card, DataTable, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { fmtDateTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listUsers } from "@/server/services/users";
import { load, sp, type SP } from "../../_lib/guard";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("user.manage")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const q = await sp(searchParams);
  const rows = await load(listUsers(ctx));
  return (
    <>
      <PageHeader title={t.nav.users} actions={<Link className="btn-primary" href="/admin/users/new">+ {L("مستخدم", "User")}</Link>} />
      {q.ok && <div className="mb-4"><Alert tone="success">{t.common.success}</Alert></div>}
      <Card bodyClassName="p-0">
        <DataTable rows={rows} rowKey={(u) => u.id} cols={[
          { key: "n", label: t.common.name, primary: true, render: (u) => <Link className="link" href={`/admin/users/${u.id}`}>{u.name}</Link> },
          { key: "e", label: t.common.email, render: (u) => <span className="num text-xs">{u.email}</span> },
          { key: "r", label: L("الدور", "Role"), render: (u) => <Badge tone="blue">{locale === "ar" ? u.role.nameAr : u.role.nameEn}</Badge> },
          { key: "s", label: L("النطاق", "Scope"), render: (u) => (u.propertyScope === "ALL" ? L("الكل", "All") : u.propertyAccess.map((a) => a.property.code).join("، ") || (u.tenant ? u.tenant.name : u.owner ? u.owner.name : "—")) },
          { key: "l", label: L("آخر دخول", "Last login"), render: (u) => <span className="text-xs">{fmtDateTime(u.lastLoginAt, locale, ctx.timezone)}</span> },
          { key: "a", label: t.common.status, render: (u) => <>{u.isActive ? <Badge tone="green">{L("نشط", "Active")}</Badge> : <Badge tone="gray">{L("معطل", "Disabled")}</Badge>}{u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="red">{L("مقفل", "Locked")}</Badge>}{u.isDemo && <Badge tone="gold">demo</Badge>}</> },
        ]} />
      </Card>
    </>
  );
}
