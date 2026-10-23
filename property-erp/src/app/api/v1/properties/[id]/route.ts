import { handler, json } from "@/server/http/api";
import { getProperty, updateProperty } from "@/server/services/properties";

export const dynamic = "force-dynamic";
export const GET = handler<{ id: string }>(async (_req, ctx, { id }) => json({ data: await getProperty(ctx, id) }));
export const PUT = handler<{ id: string }>(async (req, ctx, { id }) => json({ data: await updateProperty(ctx, id, await req.json()) }));
