/**
 * إنشاء حساب المدير الأول بطريقة آمنة من سطر الأوامر على الخادم.
 * - تفاعلي: pnpm admin:create
 * - غير تفاعلي: ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... pnpm admin:create
 * إذا كانت المنظمة موجودة، يلزم --additional لإضافة مدير آخر.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { hashPassword, passwordPolicyError } from "../src/server/auth/password";
import { audit } from "../src/server/audit";
import { prisma } from "../src/server/db";
import { bootstrapOrganization } from "../src/server/services/bootstrap";

async function ask(q: string, hidden = false) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden) {
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    out._writeToOutput = (s: string) => out.output.write(s.includes(q) ? s : "*");
  }
  const a = await rl.question(q);
  rl.close();
  if (hidden) stdout.write("\n");
  return a.trim();
}

async function main() {
  const additional = process.argv.includes("--additional");
  const orgs = await prisma.organization.count();
  if (orgs > 0 && !additional) {
    console.error("النظام مهيأ مسبقًا. لإضافة مدير آخر استخدم --additional / Already initialized; use --additional");
    process.exit(1);
  }
  const email = process.env.ADMIN_EMAIL || (await ask("Admin email: "));
  const name = process.env.ADMIN_NAME || (await ask("Admin name: "));
  const password = process.env.ADMIN_PASSWORD || (await ask("Password (10+ chars, letters & digits): ", true));
  const err = passwordPolicyError(password);
  if (err) {
    console.error(err);
    process.exit(1);
  }
  if (orgs === 0) {
    const orgName = process.env.ORG_NAME || "GLOBAL SNOW WING (GSW)";
    const { admin } = await bootstrapOrganization({ orgName, orgNameAr: "جلوبال سنو وينج", adminEmail: email, adminName: name, adminPassword: password });
    console.log(`✓ Organization initialized. Administrator: ${admin.email}`);
  } else {
    const org = await prisma.organization.findFirstOrThrow();
    const role = await prisma.role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: "ADMIN" } } });
    const user = await prisma.user.create({ data: { organizationId: org.id, email: email.toLowerCase(), name, passwordHash: await hashPassword(password), roleId: role.id, propertyScope: "ALL" } });
    await audit(prisma, { orgId: org.id, userId: null }, { action: "user.create_admin_cli", entityType: "User", entityId: user.id, summary: user.email });
    console.log(`✓ Additional administrator created: ${user.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
