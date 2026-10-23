import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { toCsv, toXlsx } from "@/server/export";
import { handler, json } from "@/server/http/api";
import { runReport, type ReportParams } from "@/server/services/reports";

export const dynamic = "force-dynamic";

/** تصدير التقارير: ?format=csv | xlsx | json */
export const GET = handler<{ key: string }>(async (req, ctx, { key }) => {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries()) as ReportParams & { format?: string };
  const r = await runReport(ctx, key, params);
  const format = params.format ?? "json";
  await audit(prisma, ctx, { action: "report.export", entityType: "Report", entityId: key, summary: `${format} ${JSON.stringify(r.filters)}` });
  const name = `${key}-${r.generatedAt.toISOString().slice(0, 10)}`;
  if (format === "csv") {
    return new Response(toCsv(r, ctx.locale), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
  }
  if (format === "xlsx") {
    const buf = await toXlsx(r, ctx.locale);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "no-store" },
    });
  }
  return json(r);
});
