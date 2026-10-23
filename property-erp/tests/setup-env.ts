import "dotenv/config";
// الاختبارات تعمل دائمًا على قاعدة الاختبارات المنفصلة، ولا تلمس قاعدة التطوير
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.STORAGE_DIR = process.env.TEST_STORAGE_DIR ?? "./storage-test";
