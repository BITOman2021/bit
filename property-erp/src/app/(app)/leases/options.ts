import type { Ctx } from "@/server/context";
import { listTemplates } from "@/server/services/leases";
import { listUnits } from "@/server/services/properties";
import { listTenants } from "@/server/services/tenants";
import { getSettings } from "@/server/services/settings";

export async function leaseFormOptions(ctx: Ctx, L: (a: string, e: string) => string) {
  const [units, tenants, templates, settings] = await Promise.all([listUnits(ctx), listTenants(ctx), listTemplates(ctx), getSettings(ctx.orgId)]);
  return {
    units: units.filter((u) => u.status !== "INACTIVE").map((u) => ({ value: u.id, label: `${u.property.code} / ${u.unitNumber} — ${u.property.name}${u.leases.length ? ` (${L("مؤجرة", "occupied")})` : ""}` })),
    tenants: tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` })),
    templates: templates.map((t) => ({ value: t.id, label: `${t.name}${t.isApproved ? " ✓" : ` (${L("غير معتمد", "not approved")})`}` })),
    taxEnabled: settings["tax.enabled"] === true,
  };
}
