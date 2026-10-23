import { redirect } from "next/navigation";
import { saveVendorAction } from "@/app/actions/ops";
import { ActionForm } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { VendorFields } from "../vendor-form";

export default async function NewVendor() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("vendor.write")) redirect("/forbidden");
  const { t, L } = await getT();
  return (
    <>
      <PageHeader title={L("مورد جديد", "New vendor")} back={{ href: "/vendors", label: t.nav.vendors }} />
      <Card><ActionForm action={saveVendorAction} submitLabel={t.common.create}><VendorFields t={t} L={L} /></ActionForm></Card>
    </>
  );
}
