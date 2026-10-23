import { redirect } from "next/navigation";
import { archivePropertyAction, updatePropertyAction } from "@/app/actions/core";
import { ActionButton, ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { getProperty } from "@/server/services/properties";
import { load } from "../../../_lib/guard";
import { PropertyFields } from "../../property-form";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("property.write")) redirect("/forbidden");
  const { id } = await params;
  const { t, L } = await getT();
  const p = await load(getProperty(ctx, id));
  return (
    <>
      <PageHeader
        title={`${t.common.edit}: ${p.name}`}
        back={{ href: `/properties/${id}`, label: p.name }}
        actions={<ActionButton action={archivePropertyAction} fields={{ id }} label={t.common.archive} className="btn-danger btn-sm" confirmText={L("أرشفة العقار؟ لن يظهر في القوائم.", "Archive this property?")} />}
      />
      <Card>
        <ActionForm action={updatePropertyAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
          <input type="hidden" name="id" value={id} />
          <PropertyFields t={t} L={L} p={p as unknown as Record<string, unknown>} />
        </ActionForm>
      </Card>
    </>
  );
}
