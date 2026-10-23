import { handler, json } from "@/server/http/api";
import { createLease, listLeases } from "@/server/services/leases";

export const dynamic = "force-dynamic";
export const GET = handler(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  return json({ data: await listLeases(ctx, { q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, propertyId: sp.get("propertyId") ?? undefined }) });
});
export const POST = handler(async (req, ctx) => json({ data: await createLease(ctx, await req.json()) }, 201));
