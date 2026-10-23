/**
 * حذف البيانات التجريبية فقط (isDemo) من بيئة التطوير — pnpm db:purge-demo --yes
 * لا يلمس أي سجل حقيقي. يرفض العمل في الإنتاج.
 * ملاحظة: سجل التدقيق لا يُحذف (غير قابل للتعديل) ويبقى شاهدًا على العمليات.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    console.error("✗ Refusing to purge in production");
    process.exit(1);
  }
  if (!process.argv.includes("--yes")) {
    console.error("Add --yes to confirm deleting demo data (isDemo = true) only.");
    process.exit(1);
  }
  const props = (await prisma.property.findMany({ where: { isDemo: true }, select: { id: true } })).map((p) => p.id);
  const tenants = (await prisma.tenant.findMany({ where: { isDemo: true }, select: { id: true } })).map((t) => t.id);
  const vendors = (await prisma.vendor.findMany({ where: { isDemo: true }, select: { id: true } })).map((v) => v.id);
  const users = (await prisma.user.findMany({ where: { isDemo: true }, select: { id: true } })).map((u) => u.id);
  const leases = (await prisma.lease.findMany({ where: { OR: [{ tenantId: { in: tenants } }, { unit: { propertyId: { in: props } } }] }, select: { id: true } })).map((l) => l.id);
  const units = (await prisma.unit.findMany({ where: { propertyId: { in: props } }, select: { id: true } })).map((u) => u.id);
  const workOrders = (await prisma.workOrder.findMany({ where: { propertyId: { in: props } }, select: { id: true } })).map((w) => w.id);
  const payments = (await prisma.payment.findMany({ where: { tenantId: { in: tenants } }, select: { id: true } })).map((p) => p.id);
  const invoices = (await prisma.invoice.findMany({ where: { OR: [{ vendorId: { in: vendors } }, { propertyId: { in: props } }] }, select: { id: true } })).map((i) => i.id);
  const entries = (
    await prisma.journalLine.findMany({ where: { OR: [{ propertyId: { in: props } }, { tenantId: { in: tenants } }, { vendorId: { in: vendors } }] }, select: { entryId: true }, distinct: ["entryId"] })
  ).map((l) => l.entryId);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL gsw.allow_demo_purge = 'on'`);
      await tx.notification.deleteMany({ where: { userId: { in: users } } });
      await tx.approval.deleteMany({ where: { OR: [{ propertyId: { in: props } }, { requestedById: { in: users } }] } });
      await tx.vendorPayment.deleteMany({ where: { invoiceId: { in: invoices } } });
      await tx.refund.deleteMany({ where: { tenantId: { in: tenants } } });
      await tx.receipt.deleteMany({ where: { paymentId: { in: payments } } });
      await tx.paymentAllocation.deleteMany({ where: { paymentId: { in: payments } } });
      await tx.payment.deleteMany({ where: { id: { in: payments } } });
      await tx.deposit.updateMany({ where: { leaseId: { in: leases } }, data: { transferredFromId: null } });
      await tx.deposit.deleteMany({ where: { leaseId: { in: leases } } });
      await tx.leaseCharge.deleteMany({ where: { leaseId: { in: leases } } });
      await tx.leaseVersion.deleteMany({ where: { leaseId: { in: leases } } });
      await tx.unitInspection.deleteMany({ where: { unitId: { in: units } } });
      await tx.lease.updateMany({ where: { id: { in: leases } }, data: { previousLeaseId: null } });
      await tx.lease.deleteMany({ where: { id: { in: leases } } });
      await tx.expense.deleteMany({ where: { OR: [{ isDemo: true }, { propertyId: { in: props } }] } });
      await tx.invoice.deleteMany({ where: { id: { in: invoices } } });
      await tx.journalLine.deleteMany({ where: { entryId: { in: entries } } });
      await tx.$executeRaw`DELETE FROM "journal_entries" WHERE "id" = ANY(${entries}) AND "reversesId" IS NOT NULL`;
      await tx.$executeRaw`DELETE FROM "journal_entries" WHERE "id" = ANY(${entries})`;
      await tx.workOrderMaterial.deleteMany({ where: { workOrderId: { in: workOrders } } });
      await tx.vendorQuote.deleteMany({ where: { OR: [{ vendorId: { in: vendors } }, { workOrderId: { in: workOrders } }] } });
      await tx.workOrder.deleteMany({ where: { id: { in: workOrders } } });
      await tx.maintenanceSchedule.deleteMany({ where: { propertyId: { in: props } } });
      await tx.maintenanceRequest.deleteMany({ where: { propertyId: { in: props } } });
      await tx.asset.deleteMany({ where: { propertyId: { in: props } } });
      await tx.purchaseOrder.deleteMany({ where: { vendorId: { in: vendors } } });
      await tx.vendorContract.deleteMany({ where: { vendorId: { in: vendors } } });
      await tx.task.deleteMany({ where: { OR: [{ propertyId: { in: props } }, { assignedToId: { in: users } }] } });
      await tx.inquiry.deleteMany({ where: { tenantId: { in: tenants } } });
      await tx.tenantDocument.deleteMany({ where: { tenantId: { in: tenants } } });
      await tx.document.deleteMany({ where: { OR: [{ propertyId: { in: props } }, { tenantId: { in: tenants } }] } });
      await tx.unit.deleteMany({ where: { id: { in: units } } });
      await tx.floor.deleteMany({ where: { building: { propertyId: { in: props } } } });
      await tx.building.deleteMany({ where: { propertyId: { in: props } } });
      await tx.ownershipShare.deleteMany({ where: { propertyId: { in: props } } });
      await tx.userPropertyAccess.deleteMany({ where: { OR: [{ propertyId: { in: props } }, { userId: { in: users } }] } });
      await tx.property.deleteMany({ where: { id: { in: props } } });
      await tx.tenant.deleteMany({ where: { id: { in: tenants } } });
      await tx.owner.deleteMany({ where: { isDemo: true } });
      await tx.vendor.deleteMany({ where: { id: { in: vendors } } });
      await tx.session.deleteMany({ where: { userId: { in: users } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    },
    { timeout: 120000 },
  );
  console.log(`✓ Demo data removed: ${props.length} properties, ${leases.length} leases, ${payments.length} payments, ${entries.length} journal entries, ${users.length} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
