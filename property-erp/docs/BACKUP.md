# دليل النسخ الاحتياطي والاستعادة

## السياسة

| البند | القيمة الموصى بها |
|---|---|
| ما يُنسخ | قاعدة البيانات كاملة (`pg_dump` بصيغة custom) + مجلد المرفقات `STORAGE_DIR` |
| التشفير | AES-256-CBC مع PBKDF2 (200,000 تكرار) عبر `openssl`؛ عبارة المرور `BACKUP_PASSPHRASE` تُحفظ منفصلة عن النسخ |
| السلامة | `SHA256SUMS` داخل الحزمة + ملف `.sha256` للحزمة المشفرة |
| التكرار | يوميًا (cron 02:30) + قبل كل تحديث للنظام |
| الاحتفاظ | 30 يومًا محليًا (`RETENTION_DAYS`)؛ نسخة شهرية خارج الخادم لمدة 12 شهرًا على الأقل |
| الموقع | قرص منفصل + تخزين خارجي (S3 متوافق/خادم آخر) — لا تبقِ النسخ على نفس الخادم فقط |
| اختبار الاستعادة | شهريًا على الأقل عبر `verify-restore.sh`، ويُوثَّق الناتج |
| المسؤولية | مدير النظام: تشغيل ومراقبة النسخ. المدير المالي: مراجعة تقرير اختبار الاستعادة شهريًا |
| RPO / RTO المستهدفة | فقدان بيانات ≤ 24 ساعة؛ زمن استعادة ≤ 4 ساعات |

> **وجود ملف نسخة احتياطية ليس دليلًا على إمكانية الاستعادة.** الدليل هو نجاح `verify-restore.sh`.

## أخذ نسخة

```bash
export DATABASE_URL="postgresql://gsw:***@localhost:5432/gsw_erp"
export BACKUP_PASSPHRASE="***"      # من خزنة الأسرار
export STORAGE_DIR=./storage BACKUP_DIR=/var/backups/gsw
scripts/backup/backup.sh
# ✓ Backup written: /var/backups/gsw/gsw-backup-20261023T200023Z.tar.enc
```

## اختبار الاستعادة (دون المساس بالإنتاج)

```bash
export ADMIN_DATABASE_URL="postgresql://gsw:***@localhost:5432/postgres"   # مستخدم لديه CREATEDB
scripts/backup/verify-restore.sh /var/backups/gsw/gsw-backup-XXXX.tar.enc
```
يقوم بـ: فك التشفير والتحقق من التجزئات ← استعادة في قاعدة مؤقتة ← مقارنة عدد السجلات ومجاميع المدين/الدائن
وعدد القيود غير المتوازنة والملفات مع المصدر ← حذف القاعدة المؤقتة.

نتيجة اختبار فعلي أثناء التطوير:
```
source:   {"properties":2,"leases":6,"charges":72,"payments":37,"journal_entries":114,"audit_logs":209,...,"total_debit":72991.250,"total_credit":72991.250,"unbalanced_entries":0}
restored: {... مطابق ...}
✓ Restore verified: counts, ledger totals and files match
```

## الاستعادة الفعلية (كارثة)

1. أوقف التطبيق: `docker compose stop app`.
2. أنشئ قاعدة جديدة فارغة (لا تستعد فوق قاعدة تعمل):
   ```bash
   createdb -O gsw gsw_erp_restored
   ```
3. استعد:
   ```bash
   BACKUP_PASSPHRASE=*** TARGET_DATABASE_URL=postgresql://gsw:***@localhost:5432/gsw_erp_restored \
   TARGET_STORAGE_DIR=/data/storage-restored scripts/backup/restore.sh gsw-backup-XXXX.tar.enc
   ```
4. وجّه `DATABASE_URL` و`STORAGE_DIR` إلى المستعاد، ثم `pnpm db:deploy` (يطبق أي migrations أحدث).
5. شغّل التطبيق وتحقق: تسجيل الدخول، ميزان المراجعة متوازن، فتح عينة من المستندات.
6. وثّق الحادثة.

## حذف البيانات والاحتفاظ بها

- السجلات المالية وسجل التدقيق لا تُحذف من النظام (حماية قاعدة البيانات)؛ أي سياسة إتلاف بعد انتهاء مدة الاحتفاظ
  النظامية تُنفذ بقرار موثق من الإدارة وعلى مستوى قاعدة البيانات بواسطة مالك المخطط.
- المستندات المؤرشفة تبقى في التخزين حتى انتهاء مدة الاحتفاظ المعتمدة.
