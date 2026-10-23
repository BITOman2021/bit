import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, parseDateOnly } from "@/lib/dates";
import { parseRatio } from "@/lib/money";
import { audit } from "../audit";
import { assertCan, assertPropertyAccess, type Ctx, scopeIn } from "../context";
import { prisma } from "../db";
import { notFound, rule } from "../errors";
import { nextNumber, SEQ } from "../sequence";
import { parse, zBool, zDate, zEmail, zId, zInt, zOptDate, zOptDecimal, zOptId, zOptInt, zOptMoney, zOptStr, zPhone, zStr, zText } from "../validation";

const PROPERTY_TYPES = ["VILLA", "APARTMENT", "RESIDENTIAL_BUILDING", "COMMERCIAL_BUILDING", "SHOP_OFFICE", "WAREHOUSE", "LAND", "MIXED_USE"] as const;
const PROPERTY_STATUSES = ["ACTIVE", "UNDER_CONSTRUCTION", "UNDER_RENOVATION", "INACTIVE", "SOLD"] as const;
const UNIT_TYPES = ["APARTMENT", "VILLA", "SHOP", "OFFICE", "WAREHOUSE", "LAND_PLOT", "ROOM", "OTHER"] as const;
const UNIT_STATUSES = ["VACANT", "OCCUPIED", "RESERVED", "UNDER_MAINTENANCE", "INACTIVE"] as const;

export const propertySchema = z.object({
  code: zOptStr(30),
  name: zStr(200),
  type: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES).default("ACTIVE"),
  governorate: zOptStr(100),
  wilayat: zOptStr(100),
  area: zOptStr(100),
  address: zOptStr(500),
  plotNumber: zOptStr(100),
  krookiNumber: zOptStr(100),
  landArea: zOptDecimal(2),
  builtArea: zOptDecimal(2),
  purchaseDate: zOptDate,
  purchasePrice: zOptMoney,
  financingDetails: zText(2000),
  estimatedValue: zOptMoney,
  valuationDate: zOptDate,
  insuranceProvider: zOptStr(200),
  insurancePolicyNo: zOptStr(100),
  insuranceExpiry: zOptDate,
  ownershipSplitEnabled: zBool.default(false),
  notes: zText(5000),
});

const d = (s?: string) => (s ? parseDateOnly(s) : null);

function propertyData(v: z.infer<typeof propertySchema>) {
  return {
    name: v.name,
    type: v.type,
    status: v.status,
    governorate: v.governorate ?? null,
    wilayat: v.wilayat ?? null,
    area: v.area ?? null,
    address: v.address ?? null,
    plotNumber: v.plotNumber ?? null,
    krookiNumber: v.krookiNumber ?? null,
    landArea: v.landArea ?? null,
    builtArea: v.builtArea ?? null,
    purchaseDate: d(v.purchaseDate),
    purchasePrice: v.purchasePrice ?? null,
    financingDetails: v.financingDetails ?? null,
    estimatedValue: v.estimatedValue ?? null,
    valuationDate: d(v.valuationDate),
    insuranceProvider: v.insuranceProvider ?? null,
    insurancePolicyNo: v.insurancePolicyNo ?? null,
    insuranceExpiry: d(v.insuranceExpiry),
    ownershipSplitEnabled: v.ownershipSplitEnabled,
    notes: v.notes ?? null,
  };
}

export async function listProperties(ctx: Ctx, f: { q?: string; type?: string; status?: string; ownerId?: string; includeArchived?: boolean } = {}) {
  assertCan(ctx, "property.read");
  const where: Prisma.PropertyWhereInput = {
    organizationId: ctx.orgId,
    id: scopeIn(ctx),
    archivedAt: f.includeArchived ? undefined : null,
    type: f.type && (PROPERTY_TYPES as readonly string[]).includes(f.type) ? (f.type as (typeof PROPERTY_TYPES)[number]) : undefined,
    status: f.status && (PROPERTY_STATUSES as readonly string[]).includes(f.status) ? (f.status as (typeof PROPERTY_STATUSES)[number]) : undefined,
    shares: f.ownerId ? { some: { ownerId: f.ownerId, effectiveTo: null } } : undefined,
    OR: f.q
      ? [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { wilayat: { contains: f.q, mode: "insensitive" } }, { area: { contains: f.q, mode: "insensitive" } }]
      : undefined,
  };
  const props = await prisma.property.findMany({
    where,
    orderBy: { code: "asc" },
    include: {
      _count: { select: { buildings: true } },
      units: { where: { archivedAt: null }, select: { status: true } },
      shares: { where: { effectiveTo: null }, include: { owner: { select: { id: true, name: true } } } },
    },
    take: 500,
  });
  return props.map((p) => ({
    ...p,
    unitCount: p.units.length,
    occupied: p.units.filter((u) => u.status === "OCCUPIED").length,
    vacant: p.units.filter((u) => u.status === "VACANT").length,
    reserved: p.units.filter((u) => u.status === "RESERVED").length,
  }));
}

export async function getProperty(ctx: Ctx, id: string) {
  assertCan(ctx, "property.read");
  assertPropertyAccess(ctx, id);
  const p = await prisma.property.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: {
      buildings: { where: { archivedAt: null }, orderBy: { code: "asc" }, include: { floors: { orderBy: { number: "asc" } } } },
      units: {
        where: { archivedAt: null },
        orderBy: [{ unitNumber: "asc" }],
        include: {
          building: true,
          floor: true,
          leases: { where: { status: "ACTIVE" }, include: { tenant: { select: { id: true, name: true } } }, take: 1 },
        },
      },
      shares: { orderBy: [{ effectiveFrom: "desc" }], include: { owner: true } },
      serviceContracts: { include: { vendor: true } },
    },
  });
  if (!p) throw notFound();
  return p;
}

export async function createProperty(ctx: Ctx, input: unknown) {
  assertCan(ctx, "property.write");
  const v = parse(propertySchema, input);
  return prisma.$transaction(async (tx) => {
    const code = v.code ?? (await nextNumber(tx, ctx.orgId, SEQ.PROPERTY)).replace(/-\d{4}-/, "-");
    const p = await tx.property.create({ data: { organizationId: ctx.orgId, code, ...propertyData(v) } });
    // مستخدم بنطاق محدود يُمنح الوصول للعقار الذي أنشأه
    if (ctx.propertyIds !== null) await tx.userPropertyAccess.create({ data: { userId: ctx.userId, propertyId: p.id } });
    await audit(tx, ctx, { action: "property.create", entityType: "Property", entityId: p.id, summary: `${p.code} ${p.name}`, after: p });
    return p;
  });
}

export async function updateProperty(ctx: Ctx, id: string, input: unknown) {
  assertCan(ctx, "property.write");
  assertPropertyAccess(ctx, id);
  const v = parse(propertySchema, input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.property.findFirst({ where: { id, organizationId: ctx.orgId } });
    if (!before) throw notFound();
    const p = await tx.property.update({ where: { id }, data: { ...propertyData(v), code: v.code ?? before.code } });
    await audit(tx, ctx, { action: "property.update", entityType: "Property", entityId: id, summary: p.code, before, after: p });
    return p;
  });
}

export async function archiveProperty(ctx: Ctx, id: string) {
  assertCan(ctx, "property.write");
  assertPropertyAccess(ctx, id);
  return prisma.$transaction(async (tx) => {
    const active = await tx.lease.count({ where: { unit: { propertyId: id }, status: "ACTIVE" } });
    if (active > 0) throw rule("لا يمكن أرشفة عقار عليه عقود سارية / Cannot archive a property with active leases");
    const p = await tx.property.update({ where: { id }, data: { archivedAt: new Date() } });
    await audit(tx, ctx, { action: "property.archive", entityType: "Property", entityId: id, summary: p.code });
    return p;
  });
}

// ------------------------- المباني والطوابق -------------------------

const buildingSchema = z.object({
  propertyId: zId,
  code: zStr(30),
  name: zStr(200),
  floorsCount: zInt(1, 200),
  yearBuilt: zOptInt(1800, 2200),
  notes: zText(2000),
  createFloors: zBool.default(true),
});

export async function createBuilding(ctx: Ctx, input: unknown) {
  assertCan(ctx, "property.write");
  const v = parse(buildingSchema, input);
  assertPropertyAccess(ctx, v.propertyId);
  return prisma.$transaction(async (tx) => {
    const prop = await tx.property.findFirst({ where: { id: v.propertyId, organizationId: ctx.orgId } });
    if (!prop) throw notFound();
    const b = await tx.building.create({
      data: { propertyId: v.propertyId, code: v.code, name: v.name, floorsCount: v.floorsCount, yearBuilt: v.yearBuilt, notes: v.notes },
    });
    if (v.createFloors) {
      await tx.floor.createMany({ data: Array.from({ length: v.floorsCount }, (_, i) => ({ buildingId: b.id, number: i, name: i === 0 ? "الأرضي / Ground" : `${i}` })) });
    }
    await audit(tx, ctx, { action: "building.create", entityType: "Building", entityId: b.id, summary: `${prop.code}/${b.code}` });
    return b;
  });
}

export async function createFloor(ctx: Ctx, input: unknown) {
  assertCan(ctx, "property.write");
  const v = parse(z.object({ buildingId: zId, number: zInt(-10, 300), name: zOptStr(100) }), input);
  const b = await prisma.building.findFirst({ where: { id: v.buildingId, property: { organizationId: ctx.orgId } } });
  if (!b) throw notFound();
  assertPropertyAccess(ctx, b.propertyId);
  const f = await prisma.floor.create({ data: { buildingId: b.id, number: v.number, name: v.name } });
  await audit(prisma, ctx, { action: "floor.create", entityType: "Floor", entityId: f.id });
  return f;
}

// ------------------------- الوحدات -------------------------

export const unitSchema = z.object({
  propertyId: zId,
  buildingId: zOptId,
  floorId: zOptId,
  unitNumber: zStr(50),
  type: z.enum(UNIT_TYPES),
  status: z.enum(UNIT_STATUSES).default("VACANT"),
  area: zOptDecimal(2),
  bedrooms: zOptInt(0, 100),
  bathrooms: zOptInt(0, 100),
  furnishing: z.enum(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]).default("UNFURNISHED"),
  fixtures: zText(2000),
  marketRent: zOptMoney,
  electricityMeter: zOptStr(100),
  waterMeter: zOptStr(100),
  notes: zText(2000),
});

async function validateUnitHierarchy(ctx: Ctx, v: z.infer<typeof unitSchema>) {
  const prop = await prisma.property.findFirst({ where: { id: v.propertyId, organizationId: ctx.orgId } });
  if (!prop) throw notFound();
  if (v.buildingId) {
    const b = await prisma.building.findFirst({ where: { id: v.buildingId, propertyId: v.propertyId } });
    if (!b) throw rule("المبنى لا يتبع هذا العقار / Building does not belong to this property");
  }
  if (v.floorId) {
    const f = await prisma.floor.findFirst({ where: { id: v.floorId, buildingId: v.buildingId ?? "__none__" } });
    if (!f) throw rule("الطابق لا يتبع هذا المبنى / Floor does not belong to this building");
  }
  return prop;
}

export async function createUnit(ctx: Ctx, input: unknown) {
  assertCan(ctx, "property.write");
  const v = parse(unitSchema, input);
  assertPropertyAccess(ctx, v.propertyId);
  await validateUnitHierarchy(ctx, v);
  if (v.status === "OCCUPIED") throw rule("حالة 'مؤجرة' تُضبط تلقائيًا عند تفعيل عقد / 'Occupied' is set automatically by an active lease");
  const u = await prisma.unit.create({ data: { ...v, buildingId: v.buildingId ?? null, floorId: v.floorId ?? null } });
  await audit(prisma, ctx, { action: "unit.create", entityType: "Unit", entityId: u.id, summary: u.unitNumber, after: u });
  return u;
}

export async function updateUnit(ctx: Ctx, id: string, input: unknown) {
  assertCan(ctx, "property.write");
  const v = parse(unitSchema, input);
  const before = await prisma.unit.findFirst({ where: { id, property: { organizationId: ctx.orgId } } });
  if (!before) throw notFound();
  assertPropertyAccess(ctx, before.propertyId);
  if (v.propertyId !== before.propertyId) throw rule("لا يمكن نقل الوحدة إلى عقار آخر / Units cannot be moved between properties");
  await validateUnitHierarchy(ctx, v);
  const activeLease = await prisma.lease.count({ where: { unitId: id, status: "ACTIVE" } });
  let status = v.status;
  if (activeLease > 0) status = "OCCUPIED";
  else if (status === "OCCUPIED") status = before.status === "OCCUPIED" ? "VACANT" : before.status;
  const u = await prisma.unit.update({ where: { id }, data: { ...v, status, buildingId: v.buildingId ?? null, floorId: v.floorId ?? null } });
  await audit(prisma, ctx, { action: "unit.update", entityType: "Unit", entityId: id, summary: u.unitNumber, before, after: u });
  return u;
}

export async function archiveUnit(ctx: Ctx, id: string) {
  assertCan(ctx, "property.write");
  const unit = await prisma.unit.findFirst({ where: { id, property: { organizationId: ctx.orgId } } });
  if (!unit) throw notFound();
  assertPropertyAccess(ctx, unit.propertyId);
  const active = await prisma.lease.count({ where: { unitId: id, status: { in: ["ACTIVE", "DRAFT"] } } });
  if (active) throw rule("لا يمكن أرشفة وحدة عليها عقد ساري أو مسودة / Cannot archive a unit with an active or draft lease");
  await prisma.unit.update({ where: { id }, data: { archivedAt: new Date(), status: "INACTIVE" } });
  await audit(prisma, ctx, { action: "unit.archive", entityType: "Unit", entityId: id, summary: unit.unitNumber });
}

export async function getUnit(ctx: Ctx, id: string) {
  assertCan(ctx, "property.read");
  const u = await prisma.unit.findFirst({
    where: { id, property: { organizationId: ctx.orgId } },
    include: {
      property: true,
      building: true,
      floor: true,
      leases: { orderBy: { startDate: "desc" }, include: { tenant: { select: { id: true, name: true, code: true } } } },
      inspections: { orderBy: { date: "desc" } },
      assets: true,
    },
  });
  if (!u) throw notFound();
  assertPropertyAccess(ctx, u.propertyId);
  return u;
}

export async function listUnits(ctx: Ctx, f: { q?: string; status?: string; propertyId?: string; type?: string } = {}) {
  assertCan(ctx, "property.read");
  return prisma.unit.findMany({
    where: {
      archivedAt: null,
      property: { organizationId: ctx.orgId, archivedAt: null },
      propertyId: f.propertyId ? (ctx.propertyIds === null || ctx.propertyIds.includes(f.propertyId) ? f.propertyId : "__none__") : scopeIn(ctx),
      status: f.status && (UNIT_STATUSES as readonly string[]).includes(f.status) ? (f.status as (typeof UNIT_STATUSES)[number]) : undefined,
      type: f.type && (UNIT_TYPES as readonly string[]).includes(f.type) ? (f.type as (typeof UNIT_TYPES)[number]) : undefined,
      OR: f.q ? [{ unitNumber: { contains: f.q, mode: "insensitive" } }, { property: { name: { contains: f.q, mode: "insensitive" } } }] : undefined,
    },
    include: {
      property: { select: { id: true, code: true, name: true } },
      building: { select: { name: true } },
      floor: { select: { number: true } },
      leases: { where: { status: "ACTIVE" }, select: { id: true, number: true, endDate: true, monthlyRent: true, tenant: { select: { id: true, name: true } } }, take: 1 },
    },
    orderBy: [{ property: { code: "asc" } }, { unitNumber: "asc" }],
    take: 1000,
  });
}

/** يعيد حساب حالة الوحدة بناءً على العقود السارية (يستدعى بعد تفعيل/إنهاء العقود) */
export async function refreshUnitStatus(tx: Prisma.TransactionClient, unitId: string) {
  const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
  const active = await tx.lease.count({ where: { unitId, status: "ACTIVE" } });
  if (active > 0 && unit.status !== "OCCUPIED") await tx.unit.update({ where: { id: unitId }, data: { status: "OCCUPIED" } });
  if (active === 0 && unit.status === "OCCUPIED") await tx.unit.update({ where: { id: unitId }, data: { status: "VACANT" } });
}

// ------------------------- محاضر التسليم والاستلام -------------------------

export async function createInspection(ctx: Ctx, input: unknown) {
  assertCanAnyWrite(ctx);
  const v = parse(
    z.object({
      unitId: zId,
      leaseId: zOptId,
      type: z.enum(["MOVE_IN", "MOVE_OUT", "PERIODIC"]),
      date: zDate,
      condition: zStr(2000),
      electricityReading: zOptStr(50),
      waterReading: zOptStr(50),
      keysHandedOver: zOptInt(0, 100),
      notes: zText(5000),
    }),
    input,
  );
  const unit = await prisma.unit.findFirst({ where: { id: v.unitId, property: { organizationId: ctx.orgId } } });
  if (!unit) throw notFound();
  assertPropertyAccess(ctx, unit.propertyId);
  if (v.leaseId) {
    const lease = await prisma.lease.findFirst({ where: { id: v.leaseId, unitId: v.unitId } });
    if (!lease) throw rule("العقد لا يخص هذه الوحدة / Lease does not belong to this unit");
  }
  const insp = await prisma.unitInspection.create({ data: { ...v, leaseId: v.leaseId ?? null, date: parseDateOnly(v.date), createdById: ctx.userId } });
  await audit(prisma, ctx, { action: "inspection.create", entityType: "UnitInspection", entityId: insp.id, summary: `${v.type} ${unit.unitNumber}` });
  return insp;
}

function assertCanAnyWrite(ctx: Ctx) {
  if (!ctx.permissions.has("property.write") && !ctx.permissions.has("lease.write")) assertCan(ctx, "property.write");
}

// ------------------------- الملاك ونسب الملكية -------------------------

export const ownerSchema = z.object({
  code: zOptStr(30),
  type: z.enum(["INDIVIDUAL", "COMPANY", "GOVERNMENT"]).default("INDIVIDUAL"),
  name: zStr(200),
  nationalId: zOptStr(50),
  crNumber: zOptStr(50),
  phone: zPhone,
  email: zEmail,
  address: zOptStr(500),
  bankDetails: zOptStr(500),
  notes: zText(2000),
});

export async function listOwners(ctx: Ctx, q?: string) {
  assertCan(ctx, "owner.read");
  return prisma.owner.findMany({
    where: {
      organizationId: ctx.orgId,
      archivedAt: null,
      id: ctx.roleKey === "OWNER" ? (ctx.ownerId ?? "__none__") : undefined,
      OR: q ? [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] : undefined,
    },
    include: { shares: { where: { effectiveTo: null }, include: { property: { select: { id: true, code: true, name: true } } } } },
    orderBy: { code: "asc" },
  });
}

export async function getOwner(ctx: Ctx, id: string) {
  assertCan(ctx, "owner.read");
  if (ctx.roleKey === "OWNER" && ctx.ownerId !== id) throw notFound();
  const o = await prisma.owner.findFirst({ where: { id, organizationId: ctx.orgId }, include: { shares: { include: { property: true }, orderBy: { effectiveFrom: "desc" } } } });
  if (!o) throw notFound();
  return o;
}

export async function createOwner(ctx: Ctx, input: unknown) {
  assertCan(ctx, "owner.write");
  const v = parse(ownerSchema, input);
  return prisma.$transaction(async (tx) => {
    const code = v.code ?? (await nextNumber(tx, ctx.orgId, SEQ.OWNER)).replace(/-\d{4}-/, "-");
    const o = await tx.owner.create({ data: { ...v, code, organizationId: ctx.orgId } });
    await audit(tx, ctx, { action: "owner.create", entityType: "Owner", entityId: o.id, summary: o.name });
    return o;
  });
}

export async function updateOwner(ctx: Ctx, id: string, input: unknown) {
  assertCan(ctx, "owner.write");
  const v = parse(ownerSchema, input);
  const before = await prisma.owner.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!before) throw notFound();
  const o = await prisma.owner.update({ where: { id }, data: { ...v, code: v.code ?? before.code } });
  await audit(prisma, ctx, { action: "owner.update", entityType: "Owner", entityId: id, before, after: o });
  return o;
}

/**
 * يحدد نسب الملكية لعقار ابتداءً من تاريخ معين.
 * يجب أن يساوي مجموع النسب 100% تمامًا. النسب السابقة تُغلق ولا تُحذف (سجل تاريخي).
 */
export async function setOwnershipShares(ctx: Ctx, input: unknown) {
  assertCan(ctx, "owner.write");
  const v = parse(
    z.object({
      propertyId: zId,
      effectiveFrom: zDate,
      documentRef: zOptStr(200),
      shares: z.array(z.object({ ownerId: zId, percentage: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/, "نسبة غير صالحة / Invalid percentage") })).min(1),
    }),
    input,
  );
  assertPropertyAccess(ctx, v.propertyId);
  const ownerIds = v.shares.map((s) => s.ownerId);
  if (new Set(ownerIds).size !== ownerIds.length) throw rule("مالك مكرر في القائمة / Duplicate owner");
  // جمع دقيق بأربع منازل عشرية
  const total = v.shares.reduce((acc, s) => {
    const r = parseRatio(s.percentage);
    return acc + (r.num * 10000n) / r.den;
  }, 0n);
  if (total !== 1000000n) throw rule(`مجموع النسب يجب أن يساوي 100% (الحالي ${Number(total) / 10000}%) / Shares must total exactly 100%`);
  if (v.shares.some((s) => parseRatio(s.percentage).num === 0n)) throw rule("لا يسمح بنسبة صفر / Zero share not allowed");
  const from = parseDateOnly(v.effectiveFrom);
  return prisma.$transaction(async (tx) => {
    const prop = await tx.property.findFirst({ where: { id: v.propertyId, organizationId: ctx.orgId } });
    if (!prop) throw notFound();
    const owners = await tx.owner.count({ where: { id: { in: ownerIds }, organizationId: ctx.orgId } });
    if (owners !== ownerIds.length) throw notFound("مالك غير موجود / Owner not found");
    const current = await tx.ownershipShare.findMany({ where: { propertyId: v.propertyId, effectiveTo: null } });
    if (current.some((c) => c.effectiveFrom >= from)) {
      // إذا بدأت النسب الحالية في نفس التاريخ أو بعده، يُرفض للحفاظ على التسلسل الزمني
      throw rule("تاريخ السريان يجب أن يكون بعد تاريخ بدء النسب الحالية / Effective date must be after the current shares' start");
    }
    await tx.ownershipShare.updateMany({ where: { propertyId: v.propertyId, effectiveTo: null }, data: { effectiveTo: addDays(from, -1) } });
    await tx.ownershipShare.createMany({
      data: v.shares.map((s) => ({ propertyId: v.propertyId, ownerId: s.ownerId, percentage: s.percentage, effectiveFrom: from, documentRef: v.documentRef })),
    });
    await audit(tx, ctx, { action: "ownership.set", entityType: "Property", entityId: v.propertyId, summary: `Ownership from ${v.effectiveFrom}`, before: current, after: v.shares });
  });
}
