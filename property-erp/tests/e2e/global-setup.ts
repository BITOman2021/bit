import { execSync } from "node:child_process";
import "dotenv/config";

export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set and differ from DATABASE_URL");
  const env = { ...process.env, DATABASE_URL: url, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes", ADMIN_EMAIL: "admin@e2e.om", ADMIN_NAME: "E2E Admin", ADMIN_PASSWORD: "Admin@123456" };
  execSync("npx prisma migrate reset --force", { stdio: "inherit", env });
  execSync("npx tsx scripts/create-admin.ts", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed-demo.ts", { stdio: "inherit", env });
}
