import { handler, json } from "@/server/http/api";
import { createTenant, listTenants } from "@/server/services/tenants";

export const dynamic = "force-dynamic";
export const GET = handler(async (req, ctx) => json({ data: await listTenants(ctx, { q: req.nextUrl.searchParams.get("q") ?? undefined }) }));
export const POST = handler(async (req, ctx) => json({ data: await createTenant(ctx, await req.json()) }, 201));
