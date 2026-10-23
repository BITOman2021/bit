import type { Db } from "./db";

export const SEQ = {
  PROPERTY: "PRP",
  OWNER: "OWN",
  TENANT: "TEN",
  LEASE: "LSE",
  CHARGE: "CHG",
  PAYMENT: "PAY",
  RECEIPT: "RCT",
  JOURNAL: "JE",
  EXPENSE: "EXP",
  INVOICE: "BILL",
  VENDOR_PAYMENT: "VPY",
  REFUND: "RFD",
  VENDOR: "VEN",
  PURCHASE_ORDER: "PO",
  REQUEST: "MR",
  WORK_ORDER: "WO",
  ASSET: "AST",
} as const;

/**
 * يولّد الرقم التالي بشكل ذري (قفل على مستوى الصف داخل المعاملة).
 * الصيغة: PREFIX-YYYY-000001
 */
export async function nextNumber(db: Db, orgId: string, prefix: string, year = new Date().getUTCFullYear()): Promise<string> {
  const key = `${prefix}-${year}`;
  const rows = await db.$queryRaw<{ v: number }[]>`
    INSERT INTO "sequences" ("organizationId", "key", "nextValue") VALUES (${orgId}, ${key}, 2)
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "nextValue" = "sequences"."nextValue" + 1
    RETURNING "nextValue" - 1 AS v`;
  const v = Number(rows[0].v);
  return `${prefix}-${year}-${String(v).padStart(6, "0")}`;
}
