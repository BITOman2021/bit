import { handler, json } from "@/server/http/api";
import { getLease } from "@/server/services/leases";

export const dynamic = "force-dynamic";
export const GET = handler<{ id: string }>(async (_req, ctx, { id }) => json({ data: await getLease(ctx, id) }));
