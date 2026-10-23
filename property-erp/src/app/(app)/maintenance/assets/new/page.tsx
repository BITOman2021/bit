import { redirect } from "next/navigation";
import { saveAssetAction } from "@/app/actions/ops";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { maintenanceOptions } from "../../opts";
import { AssetFields } from "../asset-form";

export default async function NewAsset() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("asset.write")) redirect("/forbidden");
  const { t, L } = await getT();
  const o = await maintenanceOptions(ctx);
  return (
    <>
      <PageHeader title={L("أصل جديد", "New asset")} back={{ href: "/maintenance/assets", label: t.nav.assets }} />
      <Card><ActionForm action={saveAssetAction} submitLabel={t.common.create}><AssetFields t={t} L={L} o={o} /></ActionForm></Card>
    </>
  );
}
