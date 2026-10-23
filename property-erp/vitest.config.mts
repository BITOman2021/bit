import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    globalSetup: process.argv.some((a) => a.includes("unit")) ? [] : ["tests/global-setup.ts"],
    // اختبارات التكامل تستخدم قاعدة بيانات واحدة؛ لا تشغيل متوازٍ للملفات
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
