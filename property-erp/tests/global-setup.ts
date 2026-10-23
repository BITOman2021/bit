import { execSync } from "node:child_process";
import "dotenv/config";

/** يعيد بناء قاعدة الاختبارات المنفصلة من الـ migrations مرة واحدة قبل التشغيل */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required for integration tests");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL");
  execSync("npx prisma migrate reset --force", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" } });
}
