/** المهام اليومية: انتهاء العقود، الصيانة الوقائية، التنبيهات — pnpm jobs:notifications (cron يومي) */
import "dotenv/config";
import { todayInZone } from "../src/lib/dates";
import { prisma } from "../src/server/db";
import { expireLeases } from "../src/server/services/leases";
import { generatePreventiveWorkOrders } from "../src/server/services/maintenance";
import { generateAlerts } from "../src/server/services/notifications";

async function main() {
  for (const org of await prisma.organization.findMany()) {
    const today = todayInZone(org.timezone);
    const expired = await expireLeases(org.id, today);
    const preventive = await generatePreventiveWorkOrders(org.id, today);
    const alerts = await generateAlerts(org.id, today);
    console.log(`[${new Date().toISOString()}] ${org.name}: expired=${expired} preventive=${preventive} alerts=${alerts}`);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
