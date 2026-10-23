import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { parseDateOnly } from "@/lib/dates";
import { audit } from "../audit";
import { assertCan, can, type Ctx, hasPropertyAccess } from "../context";
import { prisma } from "../db";
import { forbidden, notFound, rule } from "../errors";
import { saveFile } from "../storage";
import { parse, zBool, zOptDate, zOptId, zOptStr, zStr } from "../validation";

export const DOCUMENT_CATEGORIES = [
  "LEASE", "TITLE_DEED", "DRAWING", "INSURANCE", "INVOICE", "RECEIPT", "HANDOVER", "PHOTO",
  "QUOTATION", "MAINTENANCE_CONTRACT", "WARRANTY", "CORRESPONDENCE", "TENANT_ID", "OTHER",
] as const;

/** الفئات الحساسة تلقائيًا */
const SENSITIVE = new Set(["TENANT_ID", "TITLE_DEED"]);

const metaSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  title: zStr(200),
  propertyId: zOptId,
  unitId: zOptId,
  tenantId: zOptId,
  leaseId: zOptId,
  vendorId: zOptId,
  workOrderId: zOptId,
  requestId: zOptId,
  documentDate: zOptDate,
  expiresAt: zOptDate,
  isSensitive: zBool.default(false),
  docType: zOptStr(50),
});

/** يستنتج العقار من الكيان المرتبط حتى تُطبق صلاحيات النطاق على المستند */
async function resolveProperty(ctx: Ctx, v: z.infer<typeof metaSchema>): Promise<string | null> {
  if (v.unitId) return (await prisma.unit.findFirstOrThrow({ where: { id: v.unitId, property: { organizationId: ctx.orgId } } })).propertyId;
  if (v.leaseId) return (await prisma.lease.findFirstOrThrow({ where: { id: v.leaseId, organizationId: ctx.orgId }, include: { unit: true } })).unit.propertyId;
  if (v.workOrderId) return (await prisma.workOrder.findFirstOrThrow({ where: { id: v.workOrderId, organizationId: ctx.orgId } })).propertyId;
  if (v.requestId) return (await prisma.maintenanceRequest.findFirstOrThrow({ where: { id: v.requestId, organizationId: ctx.orgId } })).propertyId;
  if (v.propertyId) {
    await prisma.property.findFirstOrThrow({ where: { id: v.propertyId, organizationId: ctx.orgId } });
    return v.propertyId;
  }
  return null;
}

export async function uploadDocument(ctx: Ctx, file: File, meta: unknown) {
  const v = parse(metaSchema, meta);
  const isTenantUpload = ctx.roleKey === "TENANT";
  if (isTenantUpload) {
    // المستأجر يرفع صورًا لطلبات صيانته فقط
    if (!v.requestId) throw forbidden();
    const req = await prisma.maintenanceRequest.findFirst({ where: { id: v.requestId, tenantId: ctx.tenantId ?? "__none__" } });
    if (!req) throw forbidden();
    v.category = "PHOTO";
  } else {
    assertCan(ctx, "document.write");
  }
  let propertyId: string | null;
  try {
    propertyId = await resolveProperty(ctx, v);
  } catch {
    throw notFound("الكيان المرتبط غير موجود / Linked record not found");
  }
  if (!isTenantUpload && propertyId && !hasPropertyAccess(ctx, propertyId)) throw forbidden();
  if (!isTenantUpload && !propertyId && ctx.propertyIds !== null && !v.tenantId && !v.vendorId) throw forbidden();
  if (v.tenantId) {
    const t = await prisma.tenant.findFirst({ where: { id: v.tenantId, organizationId: ctx.orgId } });
    if (!t) throw notFound();
  }
  const sensitive = v.isSensitive || SENSITIVE.has(v.category);
  if (sensitive && !isTenantUpload && !can(ctx, "tenant.sensitive") && v.category === "TENANT_ID") throw forbidden();

  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await saveFile(buf, file.name);
  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: {
        organizationId: ctx.orgId,
        category: v.category,
        title: v.title,
        ...stored,
        isSensitive: sensitive,
        propertyId,
        unitId: v.unitId ?? null,
        tenantId: isTenantUpload ? ctx.tenantId : (v.tenantId ?? null),
        leaseId: v.leaseId ?? null,
        vendorId: v.vendorId ?? null,
        workOrderId: v.workOrderId ?? null,
        requestId: v.requestId ?? null,
        documentDate: v.documentDate ? parseDateOnly(v.documentDate) : null,
        expiresAt: v.expiresAt ? parseDateOnly(v.expiresAt) : null,
        uploadedById: ctx.userId,
      },
    });
    if (v.tenantId && !isTenantUpload) {
      await tx.tenantDocument.create({ data: { tenantId: v.tenantId, documentId: doc.id, docType: v.docType ?? v.category, expiresAt: doc.expiresAt } });
    }
    await audit(tx, ctx, { action: "document.upload", entityType: "Document", entityId: doc.id, summary: `${v.category} ${stored.fileName} (${stored.sizeBytes} bytes)` });
    return doc;
  });
}

/** فحص صلاحية الوصول لمستند معين */
export async function assertDocumentAccess(ctx: Ctx, documentId: string) {
  const doc = await prisma.document.findFirst({ where: { id: documentId, organizationId: ctx.orgId, deletedAt: null } });
  if (!doc) throw notFound();
  if (ctx.roleKey === "TENANT") {
    if (!ctx.tenantId) throw forbidden();
    const ownLease = doc.leaseId ? await prisma.lease.count({ where: { id: doc.leaseId, tenantId: ctx.tenantId } }) : 0;
    const ownRequest = doc.requestId ? await prisma.maintenanceRequest.count({ where: { id: doc.requestId, tenantId: ctx.tenantId } }) : 0;
    if (doc.tenantId !== ctx.tenantId && !ownLease && !ownRequest) throw forbidden();
    return doc;
  }
  assertCan(ctx, "document.read");
  if (doc.propertyId && !hasPropertyAccess(ctx, doc.propertyId)) throw forbidden();
  if (!doc.propertyId && ctx.propertyIds !== null && doc.uploadedById !== ctx.userId) throw forbidden();
  if (doc.isSensitive && !can(ctx, "tenant.sensitive")) throw forbidden("مستند حساس / Sensitive document");
  return doc;
}

export async function listDocuments(ctx: Ctx, f: { q?: string; category?: string; propertyId?: string; tenantId?: string; unitId?: string; leaseId?: string; from?: string; to?: string } = {}) {
  assertCan(ctx, "document.read");
  const where: Prisma.DocumentWhereInput = {
    organizationId: ctx.orgId,
    deletedAt: null,
    category: f.category || undefined,
    propertyId: f.propertyId ? f.propertyId : ctx.propertyIds === null ? undefined : { in: ctx.propertyIds },
    tenantId: f.tenantId || undefined,
    unitId: f.unitId || undefined,
    leaseId: f.leaseId || undefined,
    isSensitive: can(ctx, "tenant.sensitive") ? undefined : false,
    createdAt: { gte: f.from ? parseDateOnly(f.from) : undefined, lte: f.to ? new Date(parseDateOnly(f.to).getTime() + 86400000) : undefined },
    OR: f.q ? [{ title: { contains: f.q, mode: "insensitive" } }, { fileName: { contains: f.q, mode: "insensitive" } }] : undefined,
  };
  return prisma.document.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
}

export async function archiveDocument(ctx: Ctx, id: string, reason: string) {
  assertCan(ctx, "document.write");
  const doc = await assertDocumentAccess(ctx, id);
  if (!reason) throw rule("السبب مطلوب / Reason required");
  // أرشفة منطقية: الملف يبقى محفوظًا ضمن سياسة الاحتفاظ
  await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  await audit(prisma, ctx, { action: "document.archive", entityType: "Document", entityId: id, summary: `${doc.fileName}: ${reason}` });
}

export async function listDocumentsFor(ctx: Ctx, where: Prisma.DocumentWhereInput) {
  const docs = await prisma.document.findMany({ where: { ...where, organizationId: ctx.orgId, deletedAt: null }, orderBy: { createdAt: "desc" } });
  return docs.filter((d) => !d.isSensitive || can(ctx, "tenant.sensitive") || (ctx.roleKey === "TENANT" && d.tenantId === ctx.tenantId));
}
