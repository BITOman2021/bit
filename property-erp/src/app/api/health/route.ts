import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

/** فحص الصحة: يتحقق من الاتصال بقاعدة البيانات (للمراقبة وDocker healthcheck) */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "ok", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
