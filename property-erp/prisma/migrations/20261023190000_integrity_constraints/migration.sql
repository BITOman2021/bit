-- ============================================================
-- قيود السلامة المالية على مستوى قاعدة البيانات
-- (طبقة حماية ثانية بعد طبقة التطبيق)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1) سطور القيود: مبالغ غير سالبة، وطرف واحد فقط (مدين أو دائن)
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_amounts_chk"
  CHECK ("debit" >= 0 AND "credit" >= 0 AND (("debit" > 0) <> ("credit" > 0)));

-- 2) القيد المرحّل يجب أن يكون متوازنًا (يُفحص عند نهاية المعاملة)
CREATE OR REPLACE FUNCTION gsw_check_entry_balanced() RETURNS trigger AS $$
DECLARE
  v_entry_id text;
  v_status text;
  v_debit numeric;
  v_credit numeric;
  v_count int;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    v_entry_id := NEW."id";
  ELSE
    v_entry_id := COALESCE(NEW."entryId", OLD."entryId");
  END IF;
  SELECT "status"::text INTO v_status FROM "journal_entries" WHERE "id" = v_entry_id;
  IF v_status = 'POSTED' THEN
    SELECT COALESCE(SUM("debit"),0), COALESCE(SUM("credit"),0), COUNT(*)
      INTO v_debit, v_credit, v_count
      FROM "journal_lines" WHERE "entryId" = v_entry_id;
    IF v_count < 2 OR v_debit <> v_credit OR v_debit = 0 THEN
      RAISE EXCEPTION 'GSW_UNBALANCED_ENTRY: entry % debit=% credit=% lines=%', v_entry_id, v_debit, v_credit, v_count;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "journal_entries_balanced_trg"
  AFTER INSERT OR UPDATE ON "journal_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION gsw_check_entry_balanced();

CREATE CONSTRAINT TRIGGER "journal_lines_balanced_trg"
  AFTER INSERT OR UPDATE ON "journal_lines"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION gsw_check_entry_balanced();

-- 3) منع تعديل/حذف القيود المرحّلة وسطورها (التصحيح بقيد عكسي فقط)
CREATE OR REPLACE FUNCTION gsw_protect_posted_entry() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'POSTED' THEN
      RAISE EXCEPTION 'GSW_POSTED_IMMUTABLE: cannot delete posted journal entry %', OLD."id";
    END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'POSTED' THEN
    IF NEW."date" <> OLD."date" OR NEW."memo" <> OLD."memo" OR NEW."status" <> OLD."status"
       OR NEW."number" <> OLD."number" OR NEW."source" <> OLD."source"
       OR NEW."sourceKey" IS DISTINCT FROM OLD."sourceKey" THEN
      RAISE EXCEPTION 'GSW_POSTED_IMMUTABLE: cannot modify posted journal entry %', OLD."id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_entries_protect_trg"
  BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION gsw_protect_posted_entry();

CREATE OR REPLACE FUNCTION gsw_protect_posted_lines() RETURNS trigger AS $$
DECLARE v_status text;
BEGIN
  SELECT "status"::text INTO v_status FROM "journal_entries" WHERE "id" = OLD."entryId";
  IF v_status = 'POSTED' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'GSW_POSTED_IMMUTABLE: cannot delete lines of posted entry %', OLD."entryId";
    END IF;
    -- يسمح فقط بربط السطر بتسوية بنكية
    IF NEW."debit" <> OLD."debit" OR NEW."credit" <> OLD."credit" OR NEW."accountId" <> OLD."accountId"
       OR NEW."entryId" <> OLD."entryId" THEN
      RAISE EXCEPTION 'GSW_POSTED_IMMUTABLE: cannot modify lines of posted entry %', OLD."entryId";
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "journal_lines_protect_trg"
  BEFORE UPDATE OR DELETE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION gsw_protect_posted_lines();

-- 4) سجل التدقيق غير قابل للتعديل أو الحذف
CREATE OR REPLACE FUNCTION gsw_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'GSW_AUDIT_IMMUTABLE: audit log rows cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_immutable_trg"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION gsw_audit_immutable();

-- 5) السجلات المالية التاريخية لا تُحذف نهائيًا
CREATE OR REPLACE FUNCTION gsw_no_delete_financial() RETURNS trigger AS $$
BEGIN
  IF current_setting('gsw.allow_demo_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'GSW_NO_DELETE: financial records in % cannot be deleted; void or reverse instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payments_no_delete_trg" BEFORE DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION gsw_no_delete_financial();
CREATE TRIGGER "receipts_no_delete_trg" BEFORE DELETE ON "receipts" FOR EACH ROW EXECUTE FUNCTION gsw_no_delete_financial();
CREATE TRIGGER "lease_charges_no_delete_trg" BEFORE DELETE ON "lease_charges" FOR EACH ROW EXECUTE FUNCTION gsw_no_delete_financial();
CREATE TRIGGER "payment_allocations_no_delete_trg" BEFORE DELETE ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION gsw_no_delete_financial();
CREATE TRIGGER "refunds_no_delete_trg" BEFORE DELETE ON "refunds" FOR EACH ROW EXECUTE FUNCTION gsw_no_delete_financial();
CREATE TRIGGER "vendor_payments_no_delete_trg" BEFORE DELETE ON "vendor_payments" FOR EACH ROW EXECUTE FUNCTION gsw_no_delete_financial();

-- 6) فحوص المبالغ
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0 AND "unallocated" >= 0 AND "unallocated" <= "amount");
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "lease_charges" ADD CONSTRAINT "lease_charges_amount_chk"
  CHECK ("netAmount" >= 0 AND "taxAmount" >= 0 AND "amount" = "netAmount" + "taxAmount" AND "paidAmount" >= 0 AND "paidAmount" <= "amount");
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_amount_chk"
  CHECK ("required" >= 0 AND "received" >= 0 AND "deducted" >= 0 AND "refunded" >= 0 AND "deducted" + "refunded" <= "received");
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_chk" CHECK ("amount" >= 0 AND "taxAmount" >= 0 AND "total" = "amount" + "taxAmount" AND "total" > 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_chk"
  CHECK ("amount" >= 0 AND "taxAmount" >= 0 AND "total" = "amount" + "taxAmount" AND "total" > 0 AND "paidAmount" >= 0 AND "paidAmount" <= "total");
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_amount_chk" CHECK ("amount" > 0);
ALTER TABLE "ownership_shares" ADD CONSTRAINT "ownership_shares_pct_chk" CHECK ("percentage" > 0 AND "percentage" <= 100);
ALTER TABLE "leases" ADD CONSTRAINT "leases_dates_chk" CHECK ("endDate" >= "startDate" AND "monthlyRent" >= 0 AND "depositAmount" >= 0);
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_rating_chk" CHECK ("qualityRating" IS NULL OR ("qualityRating" BETWEEN 1 AND 5));

-- 7) لا يمكن وجود عقدين ساريين متداخلين على نفس الوحدة
ALTER TABLE "leases" ADD CONSTRAINT "leases_no_overlap_excl"
  EXCLUDE USING gist ("unitId" WITH =, daterange("startDate", "endDate", '[]') WITH &&)
  WHERE ("status" = 'ACTIVE');
