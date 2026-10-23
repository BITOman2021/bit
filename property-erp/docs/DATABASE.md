# دليل قاعدة البيانات

- **المحرك:** PostgreSQL 16 — **ORM:** Prisma 7.10 مع `@prisma/adapter-pg`.
- **المخطط:** `prisma/schema.prisma` — **الإعداد:** `prisma.config.ts` (يقرأ `DATABASE_URL`).
- **الأموال:** `NUMERIC(18,3)` (ريال عُماني بثلاث منازل)، النسب `NUMERIC(7,4)`.
- **المعرفات:** `cuid` نصية. **التواريخ المالية:** `DATE` (بدون وقت) لمنع انزياح المناطق الزمنية.

## الـ Migrations

| Migration | المحتوى |
|---|---|
| `20261023184738_init` | جميع الجداول والعلاقات والفهارس |
| `20261023190000_integrity_constraints` | مشغلات توازن القيود، منع تعديل القيود المرحّلة، سجل تدقيق غير قابل للتعديل، منع حذف السجلات المالية، فحوص المبالغ، منع تداخل العقود السارية (`EXCLUDE USING gist`) |
| `20261023200000_truncate_protection` | منع `TRUNCATE` على السجل والجداول المالية |
| `20261023210000_demo_purge_bypass` | استثناء صريح ومقيد لحذف البيانات التجريبية فقط |

```bash
pnpm db:deploy        # الإنتاج/الخوادم: تطبيق migrations المعلقة فقط (آمن وقابل للتكرار)
pnpm db:migrate       # التطوير: إنشاء migration جديدة بعد تعديل المخطط
pnpm db:generate      # إعادة توليد Prisma Client
```

## الجداول الرئيسية

organizations · users · roles · permissions · role_permissions · user_property_access · sessions · login_attempts ·
owners · ownership_shares · properties · buildings · floors · units · unit_inspections · tenants · tenant_documents ·
lease_templates · leases · lease_versions · lease_charges · payments · payment_allocations · receipts · deposits ·
refunds · chart_of_accounts · journal_entries · journal_lines · bank_accounts · bank_reconciliations ·
expense_categories · expenses · vendors · vendor_contracts · vendor_quotes · purchase_orders · purchase_order_lines ·
invoices (فواتير الموردين) · vendor_payments · maintenance_requests · work_orders · work_order_materials ·
maintenance_schedules · assets · documents · notifications · tasks · approvals · inquiries · audit_logs ·
system_settings · sequences

## سياسة الحذف

| النوع | السياسة |
|---|---|
| السجلات المالية (القيود المرحّلة، الدفعات، الإيصالات، الاستحقاقات، التخصيصات، الاستردادات، دفعات الموردين) | **لا حذف** (مشغل قاعدة بيانات). التصحيح بالإلغاء (VOID) والقيد العكسي |
| سجل التدقيق | لا تعديل ولا حذف ولا TRUNCATE |
| العقارات، الوحدات، المستأجرون، الملاك، الموردون | أرشفة منطقية (`archivedAt`) |
| المستندات | أرشفة منطقية (`deletedAt`)؛ الملف يبقى في التخزين وفق سياسة الاحتفاظ |
| مسودات القيود والعقود | يمكن حذف/إلغاء المسودة قبل الترحيل/الاعتماد |
| البيانات التجريبية | `pnpm db:purge-demo --yes` في التطوير فقط |

## صلاحيات مستخدم قاعدة البيانات في الإنتاج

يُنصح بمستخدمين منفصلين: مالك المخطط (لتطبيق migrations فقط) ومستخدم التطبيق بصلاحيات
`SELECT, INSERT, UPDATE, DELETE` دون `TRUNCATE` أو ملكية الجداول — حتى لا يستطيع التطبيق تعطيل المشغلات.
