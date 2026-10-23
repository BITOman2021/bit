-- منع TRUNCATE على سجل التدقيق والجداول المالية (TRUNCATE يتجاوز مشغلات الصفوف)
-- يُسمح فقط عند ضبط gsw.allow_truncate = 'on' صراحة في الجلسة (اختبارات آلية على قاعدة اختبار منفصلة)
CREATE OR REPLACE FUNCTION gsw_block_truncate() RETURNS trigger AS $$
BEGIN
  IF current_setting('gsw.allow_truncate', true) = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'GSW_NO_TRUNCATE: % cannot be truncated', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs','journal_entries','journal_lines','payments','receipts','lease_charges','payment_allocations','refunds','vendor_payments','deposits','expenses','invoices']
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION gsw_block_truncate()', t || '_no_truncate_trg', t);
  END LOOP;
END $$;
