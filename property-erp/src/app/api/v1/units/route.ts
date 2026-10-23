import { handler, json } from "@/server/http/api";
import { createUnit, listUnits } from "@/server/services/properties";

export const dynamic = "force-dynamic";
export const GET = handler(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  return json({ data: await listUnits(ctx, { q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, propertyId: sp.get("propertyId") ?? undefined }) });
});
export const POST = handler(async (req, ctx) => json({ data: await createUnit(ctx, await req.json()) }, 201));
