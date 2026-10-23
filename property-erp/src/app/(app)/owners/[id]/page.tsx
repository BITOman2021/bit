import Link from "next/link";
import { updateOwnerAction } from "@/app/actions/core";
import { ActionForm } from "@/components/ui/form";
import { Card, DataTable, Empty, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getOwner } from "@/server/services/properties";
import { load } from "../../_lib/guard";
import { OwnerFields } from "../owner-form";

export default async function OwnerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L } = await getT();
  const o = await load(getOwner(ctx, id));
  return (
    <>
      <PageHeader
        title={o.name}
        subtitle={<span className="num">{o.code}</span>}
        back={{ href: "/owners", label: t.nav.owners }}
        actions={ctx.permissions.has("report.read") && <Link className="btn-secondary" href={`/reports/owner-statement?ownerId=${o.id}`}>{L("كشف حساب المالك", "Owner statement")}</Link>}
      />
      <div className="space-y-4">
        <Card title={L("العقارات ونسب الملكية", "Properties & shares")} bodyClassName="p-0">
          <DataTable
            rows={o.shares}
            rowKey={(s) => s.id}
            empty={<Empty title={t.common.empty} />}
            cols={[
              { key: "p", label: t.common.property, primary: true, render: (s) => <Link className="link" href={`/properties/${s.propertyId}`}>{s.property.code} {s.property.name}</Link> },
              { key: "pct", label: t.common.percent, render: (s) => <span className="num font-semibold">{Number(s.percentage)}%</span> },
              { key: "f", label: t.common.from, render: (s) => <span className="num">{fmtDate(s.effectiveFrom)}</span> },
              { key: "to", label: t.common.to, render: (s) => <span className="num">{s.effectiveTo ? fmtDate(s.effectiveTo) : L("حالي", "current")}</span> },
            ]}
          />
        </Card>
        {ctx.permissions.has("owner.write") && (
          <Card title={t.common.edit}>
            <ActionForm action={updateOwnerAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
              <input type="hidden" name="id" value={o.id} />
              <OwnerFields t={t} L={L} o={o as unknown as Record<string, unknown>} />
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
