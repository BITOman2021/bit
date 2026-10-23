import Link from "next/link";
import { Badge, Card } from "@/components/ui/kit";
import type { Dict } from "@/i18n/dict";
import { prisma } from "@/server/db";

export async function AuditTrail({ entityId, t, L, canSee }: { entityId: string; t: Dict; L: (a: string, e: string) => string; canSee: boolean }) {
  if (!canSee) return null;
  const rows = await prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: "desc" }, take: 20 });
  if (!rows.length) return null;
  return (
    <Card title={L("سجل التعديلات والعمليات", "Change & activity log")}>
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-2">
            <span className="num text-xs text-muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
            <Badge tone="gray">{r.action}</Badge>
            <span className="text-muted">{r.summary}</span>
          </li>
        ))}
      </ul>
      <Link href={`/admin/audit?q=${entityId}`} className="link mt-2 inline-block text-xs">{t.common.view} {t.nav.audit}</Link>
    </Card>
  );
}
