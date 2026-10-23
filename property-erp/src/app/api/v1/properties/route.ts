import { handler, json } from "@/server/http/api";
import { createProperty, listProperties } from "@/server/services/properties";

export const dynamic = "force-dynamic";
export const GET = handler(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  return json({ data: await listProperties(ctx, { q: sp.get("q") ?? undefined, type: sp.get("type") ?? undefined, status: sp.get("status") ?? undefined }) });
});
export const POST = handler(async (req, ctx) => json({ data: await createProperty(ctx, await req.json()) }, 201));
