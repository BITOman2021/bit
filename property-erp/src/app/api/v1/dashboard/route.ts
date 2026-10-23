import { parseDateOnly } from "@/lib/dates";
import { handler, json } from "@/server/http/api";
import { getDashboard } from "@/server/services/dashboard";

export const dynamic = "force-dynamic";
export const GET = handler(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const d = (k: string) => (sp.get(k) ? parseDateOnly(sp.get(k)!) : undefined);
  return json({ data: await getDashboard(ctx, { from: d("from"), to: d("to"), propertyId: sp.get("propertyId") ?? undefined, ownerId: sp.get("ownerId") ?? undefined }) });
});
