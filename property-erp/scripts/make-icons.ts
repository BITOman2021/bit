/** يولّد أيقونات PNG من icon.svg باستخدام Chromium المثبت (Playwright) */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icon.svg", "utf8");

async function main() {
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: true });
}
await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
