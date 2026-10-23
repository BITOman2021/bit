import { archiveDocumentAction, uploadDocumentAction } from "@/app/actions/ops";
import { ActionButton, ActionForm, Input, Select } from "@/components/ui/form";
import { Badge, Card, Empty } from "@/components/ui/kit";
import { type Dict, label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { fmtDate } from "@/lib/format";
import type { Ctx } from "@/server/context";
import type { Prisma } from "@/generated/prisma/client";
import { listDocumentsFor } from "@/server/services/documents";

export async function DocumentsPanel({
  ctx,
  t,
  L,
  where,
  link,
  categories,
}: {
  ctx: Ctx;
  t: Dict;
  L: (a: string, e: string) => string;
  where: Prisma.DocumentWhereInput;
  link: Record<string, string>;
  categories?: string[];
}) {
  const docs = ctx.permissions.has("document.read") ? await listDocumentsFor(ctx, where) : [];
  const canWrite = ctx.permissions.has("document.write");
  return (
    <Card title={t.nav.documents}>
      {docs.length === 0 ? (
        <Empty title={L("لا توجد مستندات", "No documents")} />
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <Badge tone="blue">{label(t, "DocCategory", d.category)}</Badge>
              {d.isSensitive && <Badge tone="red">{L("حساس", "Sensitive")}</Badge>}
              <a href={`/api/documents/${d.id}`} className="link flex-1 truncate" target="_blank" rel="noopener">
                {d.title}
              </a>
              <span className="num text-xs text-muted">{fmtDate(d.createdAt)}</span>
              <span className="num text-xs text-muted">{Math.ceil(d.sizeBytes / 1024)} KB</span>
              {canWrite && <ActionButton action={archiveDocumentAction} fields={{ id: d.id }} label={t.common.archive} className="btn-ghost btn-sm" askReason={t.common.reason} />}
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <details className="mt-4 rounded-lg border border-dashed border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold text-navy-700">+ {t.common.upload}</summary>
          <ActionForm action={uploadDocumentAction} submitLabel={t.common.upload} pendingLabel={t.common.saving} resetOnSuccess className="mt-3">
            {Object.entries(link).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select name="category" label={t.common.category} options={enumOptions(t, "DocCategory", categories)} required />
              <Input name="title" label={L("العنوان", "Title")} required />
              <Input name="documentDate" type="date" label={t.common.date} />
              <Input name="expiresAt" type="date" label={L("تاريخ الانتهاء", "Expiry date")} />
              <Input name="file" type="file" label={L("الملف (PDF، صور، Word، Excel — حتى 15MB)", "File (PDF, images, Word, Excel — max 15MB)")} accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.docx,.xlsx,image/*" capture={undefined} required className="sm:col-span-2" />
            </div>
          </ActionForm>
        </details>
      )}
    </Card>
  );
}
