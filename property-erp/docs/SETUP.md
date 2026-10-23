# دليل التشغيل المحلي (Windows / macOS / Linux)

## 1. المتطلبات

| الأداة | الإصدار | ملاحظات |
|---|---|---|
| Node.js | 22 LTS أو أحدث | https://nodejs.org |
| pnpm | 10.x | `corepack enable` ثم `corepack prepare pnpm@10.28.0 --activate` |
| PostgreSQL | 16 | محليًا أو عبر Docker |
| Git | أي إصدار حديث | |

> يُستخدم **pnpm** وليس npm لأن npm 10.9 فشل في حل اعتماديات بعض الحزم (خطأ داخلي `edgesOut`).

## 2. تثبيت PostgreSQL

### Windows
1. نزّل مثبت PostgreSQL 16 من https://www.postgresql.org/download/windows/ وثبّته (احفظ كلمة مرور `postgres`).
2. افتح **SQL Shell (psql)** ونفّذ:
   ```sql
   CREATE USER gsw WITH PASSWORD 'كلمة_مرور_قوية' CREATEDB;
   CREATE DATABASE gsw_erp OWNER gsw;
   CREATE DATABASE gsw_erp_test OWNER gsw;  -- للاختبارات فقط
   ```

### macOS
```bash
brew install postgresql@16
brew services start postgresql@16
createuser -s gsw   # أو أنشئ مستخدمًا بكلمة مرور كما في الأعلى
psql postgres -c "ALTER USER gsw WITH PASSWORD 'كلمة_مرور_قوية';"
createdb -O gsw gsw_erp && createdb -O gsw gsw_erp_test
```

### بديل عبر Docker (كل الأنظمة)
```bash
docker run -d --name gsw-db -e POSTGRES_USER=gsw -e POSTGRES_PASSWORD=كلمة_مرور_قوية -e POSTGRES_DB=gsw_erp -p 5432:5432 postgres:16-alpine
docker exec gsw-db createdb -U gsw gsw_erp_test
```

## 3. إعداد المشروع

```bash
git clone <repo> && cd bit/property-erp
cp .env.example .env
```
عدّل `.env`:
- `DATABASE_URL` و`TEST_DATABASE_URL` (قاعدتان مختلفتان؛ الاختبارات تمسح قاعدة الاختبار بالكامل).
- `APP_SECRET`: سر عشوائي طويل:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

> على Windows (PowerShell) استخدم `copy .env.example .env`.

```bash
pnpm install
pnpm db:deploy          # تطبيق جميع migrations
pnpm admin:create       # يطلب البريد والاسم وكلمة المرور (مخفية)
pnpm dev
```
افتح http://localhost:3000 وسجّل الدخول.

### بيانات تجريبية (اختياري — للتطوير فقط)
```bash
pnpm db:seed-demo       # عقاران، 10 وحدات، 6 عقود، دفعات، صيانة، مصروفات + مستخدمون تجريبيون
pnpm db:purge-demo --yes   # حذف البيانات التجريبية فقط
```
كلمة مرور المستخدمين التجريبيين: `Demo@123456` (manager@ / accountant@ / maintenance@ / collector@ / leasing@ /
tech@ / auditor@ / owner@ / tenant@ `demo.gsw.om`). الأمر يرفض العمل إذا كان `NODE_ENV=production` أو `APP_ENV=production`.

## 4. تشغيل الاختبارات

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration     # يحتاج TEST_DATABASE_URL
pnpm test:e2e             # يشغّل خادمًا منفصلًا على المنفذ 3100 بقاعدة الاختبار
```
إذا كان Chromium مثبتًا في مسار خاص: `CHROMIUM_PATH=/path/to/chrome pnpm test:e2e`، أو ثبّته عبر
`npx playwright install chromium`.

## 5. التثبيت كتطبيق (PWA)

- **Windows / macOS (Chrome أو Edge):** أيقونة "تثبيت" في شريط العنوان.
- **iPhone / iPad (Safari):** مشاركة ← "إضافة إلى الشاشة الرئيسية".
- **Android (Chrome):** القائمة ← "تثبيت التطبيق".

يتطلب التثبيت خارج `localhost` اتصال HTTPS. لا يوجد تطبيق أصلي منفصل لـ Mac أو المتاجر؛ النسخة المطلوبة تطبيق ويب
متجاوب قابل للتثبيت.

## 6. مشاكل شائعة

| المشكلة | الحل |
|---|---|
| `DATABASE_URL is not set` | تأكد من وجود `.env` في مجلد `property-erp` |
| `Can't reach database server` | تأكد من تشغيل PostgreSQL والمنفذ 5432 |
| فشل `pnpm install` بسبب سكربتات البناء | الحزم المسموح لها محددة في `package.json → pnpm.onlyBuiltDependencies` |
| صفحة الإعداد تطلب SETUP_TOKEN | استخدم `pnpm admin:create` (الطريقة الموصى بها) |
