import { PERMISSIONS, ROLES } from "../auth/permissions";
import { hashPassword, passwordPolicyError } from "../auth/password";
import { audit } from "../audit";
import { prisma, type Db } from "../db";
import { rule } from "../errors";
import { seedChartOfAccounts } from "./accounting";

/** يزامن كتالوج الصلاحيات وأدوار النظام لمنظمة */
export async function syncPermissionsAndRoles(db: Db, orgId: string) {
  for (const [key, [ar, en]] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({ where: { key }, update: { descriptionAr: ar, descriptionEn: en }, create: { key, descriptionAr: ar, descriptionEn: en } });
  }
  for (const [key, def] of Object.entries(ROLES)) {
    const role = await db.role.upsert({
      where: { organizationId_key: { organizationId: orgId, key } },
      update: { nameAr: def.nameAr, nameEn: def.nameEn },
      create: { organizationId: orgId, key, nameAr: def.nameAr, nameEn: def.nameEn, isSystem: true },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: def.permissions.map((p) => ({ roleId: role.id, permissionKey: p })) });
  }
}

/**
 * التهيئة الأولى: إنشاء المنظمة والأدوار ودليل الحسابات وحساب المدير الأول.
 * تُرفض إذا كانت هناك منظمة موجودة مسبقًا (لمنع إنشاء مدير ثانٍ بهذه الطريقة).
 */
export async function bootstrapOrganization(input: { orgName: string; orgNameAr?: string; adminEmail: string; adminName: string; adminPassword: string }, db = prisma) {
  const policy = passwordPolicyError(input.adminPassword);
  if (policy) throw rule(policy);
  const email = input.adminEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw rule("بريد إلكتروني غير صالح / Invalid email");
  const existing = await db.organization.count();
  if (existing > 0) throw rule("النظام مهيأ مسبقًا / The system is already initialized");
  const passwordHash = await hashPassword(input.adminPassword);
  return db.$transaction(
    async (tx) => {
      const org = await tx.organization.create({ data: { name: input.orgName, nameAr: input.orgNameAr } });
      await syncPermissionsAndRoles(tx, org.id);
      await seedChartOfAccounts(tx, org.id);
      const adminRole = await tx.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: "ADMIN" } } });
      const admin = await tx.user.create({
        data: { organizationId: org.id, email, name: input.adminName, passwordHash, roleId: adminRole.id, propertyScope: "ALL" },
      });
      await audit(tx, { orgId: org.id, userId: admin.id }, { action: "system.bootstrap", entityType: "Organization", entityId: org.id, summary: `Initialized by ${email}` });
      return { org, admin };
    },
    { timeout: 60000 },
  );
}
