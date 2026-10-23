import Link from "next/link";
import { saveAssetAction } from "@/app/actions/ops";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { ActionForm } from "@/components/ui/form";
import { Badge, Card, DataTable, Empty, PageHeader } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getAsset } from "@/server/services/maintenance";
import { load } from "../../../_lib/guard";
import { maintenanceOptions } from "../../opts";
import { AssetFields } from "../asset-form";

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { t, L } = await getT();
  const a = await load(getAsset(ctx, id));
  return (
    <>
      <PageHeader title={`${a.tag} — ${a.name}`} subtitle={label(t, "MaintenanceCategory", a.category)} back={{ href: "/maintenance/assets", label: t.nav.assets }} />
      <div className="space-y-4">
        <Card title={L("سجل الإصلاحات", "Repair history")} bodyClassName="p-0">
          <DataTable
            rows={a.workOrders}
            rowKey={(w) => w.id}
            empty={<Empty title={t.common.empty} />}
            cols={[
              { key: "n", label: t.common.reference, primary: true, render: (w) => <Link className="link num" href={`/maintenance/work-orders/${w.id}`}>{w.number}</Link> },
              { key: "t", label: L("العنوان", "Title"), render: (w) => w.title },
              { key: "d", label: t.common.date, render: (w) => <span className="num">{fmtDate(w.createdAt)}</span> },
              { key: "s", label: t.common.status, render: (w) => <Badge status={w.status}>{label(t, "WorkOrderStatus", w.status)}</Badge> },
            ]}
          />
        </Card>
        {ctx.permissions.has("asset.write") && (
          <Card title={t.common.edit}>
            <ActionForm action={saveAssetAction} submitLabel={t.common.save}>
              <input type="hidden" name="id" value={id} />
              <AssetFields t={t} L={L} o={await maintenanceOptions(ctx)} a={{ ...a, purchaseCost: a.purchaseCost?.toFixed(3) }} />
            </ActionForm>
          </Card>
        )}
        <DocumentsPanel ctx={ctx} t={t} L={L} where={{ propertyId: a.propertyId, category: { in: ["WARRANTY", "PHOTO"] }, title: { contains: a.tag } }} link={{ propertyId: a.propertyId }} categories={["WARRANTY", "PHOTO", "INVOICE"]} />
      </div>
    </>
  );
}
