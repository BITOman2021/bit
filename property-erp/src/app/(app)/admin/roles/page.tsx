import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { PERMISSIONS } from "@/server/auth/permissions";
import { requireCtx } from "@/server/auth/next";
import { listRoles } from "@/server/services/users";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("user.manage")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const roles = await listRoles(ctx);
  const perms = Object.entries(PERMISSIONS);
  return (
    <>
      <PageHeader title={t.nav.roles} subtitle={L("مصفوفة الصلاحيات تُفرض على الخادم في كل عملية. تُضاف قيود نطاق العقارات لكل مستخدم.", "Permissions are enforced server-side on every operation, plus per-user property scope.")} />
      <Card bodyClassName="p-0 overflow-auto max-h-[75vh]">
        <table className="dtable text-xs">
          <thead>
            <tr>
              <th className="min-w-[220px]">{L("الصلاحية", "Permission")}</th>
              {roles.map((r) => <th key={r.id} className="text-center">{locale === "ar" ? r.nameAr : r.nameEn}<div className="font-normal normal-case">({r._count.users})</div></th>)}
            </tr>
          </thead>
          <tbody>
            {perms.map(([key, [ar, en]]) => (
              <tr key={key}>
                <td><span className="font-semibold">{locale === "ar" ? ar : en}</span><div className="num text-[10px] text-muted">{key}</div></td>
                {roles.map((r) => <td key={r.id} className="text-center">{r.permissions.some((p) => p.permissionKey === key) ? <span className="text-success">●</span> : <span className="text-line">○</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
