import { handler, json } from "@/server/http/api";

export const dynamic = "force-dynamic";
export const GET = handler(async (_req, ctx) => json({ id: ctx.userId, name: ctx.userName, email: ctx.email, role: ctx.roleKey, permissions: [...ctx.permissions], propertyScope: ctx.propertyIds ?? "ALL", locale: ctx.locale }));
