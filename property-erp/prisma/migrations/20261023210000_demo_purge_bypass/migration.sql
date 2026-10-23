-- يسمح بحذف البيانات التجريبية فقط عند ضبط gsw.allow_demo_purge = 'on' صراحة داخل المعاملة
-- (يُستخدم حصرًا من أمر purge-demo في بيئة التطوير؛ الأمر يرفض العمل في الإنتاج)
CREATE OR REPLACE FUNCTION gsw_protect_posted_entry() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'POSTED' AND current_setting('gsw.allow_demo_purge', true) IS DISTINCT FROM 'on' THEN
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

CREATE OR REPLACE FUNCTION gsw_protect_posted_lines() RETURNS trigger AS $$
DECLARE v_status text;
BEGIN
  SELECT "status"::text INTO v_status FROM "journal_entries" WHERE "id" = OLD."entryId";
  IF v_status = 'POSTED' THEN
    IF TG_OP = 'DELETE' THEN
      IF current_setting('gsw.allow_demo_purge', true) = 'on' THEN RETURN OLD; END IF;
      RAISE EXCEPTION 'GSW_POSTED_IMMUTABLE: cannot delete lines of posted entry %', OLD."entryId";
    END IF;
    IF NEW."debit" <> OLD."debit" OR NEW."credit" <> OLD."credit" OR NEW."accountId" <> OLD."accountId"
       OR NEW."entryId" <> OLD."entryId" THEN
      RAISE EXCEPTION 'GSW_POSTED_IMMUTABLE: cannot modify lines of posted entry %', OLD."entryId";
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
