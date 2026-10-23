# دليل النشر على خادم

## الخيار أ: Docker Compose (موصى به)

```bash
cd property-erp
cat > .env.production <<'ENV'
APP_SECRET=<سر عشوائي 48 بايت>
APP_URL=https://erp.example.om
COOKIE_SECURE=true
SESSION_TTL_HOURS=12
MAX_UPLOAD_MB=15
NODE_ENV=production
APP_ENV=production
ENV
export POSTGRES_PASSWORD='<كلمة مرور قوية>'
docker compose up -d --build              # يطبق migrations تلقائيًا ثم يشغّل الخادم
docker compose exec app node_modules/.bin/tsx scripts/create-admin.ts   # المدير الأول (تفاعلي)
```

التطبيق يستمع على `127.0.0.1:3000` فقط؛ ضع أمامه خادمًا عكسيًا مع HTTPS.

### Caddy (HTTPS تلقائي)
```
erp.example.om {
  reverse_proxy 127.0.0.1:3000
  encode gzip
}
```

### Nginx
```nginx
server {
  listen 443 ssl http2;
  server_name erp.example.om;
  ssl_certificate     /etc/letsencrypt/live/erp.example.om/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/erp.example.om/privkey.pem;
  client_max_body_size 16m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```
> مهم: مرّر `X-Forwarded-Host` حتى ينجح فحص المصدر (CSRF) في Server Actions وواجهات API.
> اضبط `X-Forwarded-For` إلى `$remote_addr` (لا تُلحق قيمة العميل) لأن حد المحاولات يعتمد عليه.

## الخيار ب: Node.js مباشرة (systemd)

```bash
pnpm install --frozen-lockfile && pnpm build && pnpm db:deploy
# الخادم المستقل:
cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
NODE_ENV=production node .next/standalone/server.js
```
ملف `/etc/systemd/system/gsw-erp.service`:
```ini
[Unit]
Description=GSW Property ERP
After=network.target postgresql.service
[Service]
WorkingDirectory=/opt/gsw/property-erp
EnvironmentFile=/opt/gsw/property-erp/.env.production
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=always
User=gsw
[Install]
WantedBy=multi-user.target
```

## المهام الدورية (cron)

```cron
# يوميًا 05:10 بتوقيت مسقط: انتهاء العقود + الصيانة الوقائية + التنبيهات
10 5 * * *  cd /opt/gsw/property-erp && /usr/bin/pnpm jobs:notifications >> /var/log/gsw-jobs.log 2>&1
# نسخة احتياطية مشفرة يوميًا 02:30
30 2 * * *  cd /opt/gsw/property-erp && set -a && . ./.env.production && set +a && scripts/backup/backup.sh >> /var/log/gsw-backup.log 2>&1
```
داخل Docker: `docker compose exec app node_modules/.bin/tsx scripts/run-notifications.ts`.

## قائمة التحقق قبل الإنتاج

- [ ] HTTPS مفعل و`COOKIE_SECURE=true` (يفعّل أيضًا HSTS).
- [ ] `APP_SECRET` عشوائي وفريد؛ الأسرار في متغيرات البيئة فقط وليست في Git.
- [ ] منفذ قاعدة البيانات غير مكشوف للإنترنت.
- [ ] مستخدم قاعدة بيانات للتطبيق بدون صلاحية TRUNCATE/ملكية (راجع DATABASE.md).
- [ ] `STORAGE_DIR` على قرص دائم ومضمّن في النسخ الاحتياطي.
- [ ] جدولة `jobs:notifications` والنسخ الاحتياطي، وتنفيذ **اختبار استعادة** (BACKUP.md).
- [ ] عدم تشغيل `db:seed-demo` في الإنتاج (الأمر يرفض أصلًا مع `APP_ENV=production`).
- [ ] ترك `SETUP_TOKEN` فارغًا بعد إنشاء المدير.
- [ ] بيئة تطوير منفصلة بقاعدة بيانات ونطاق منفصلين.
- [ ] عند تشغيل أكثر من نسخة من التطبيق: حد معدل الطلبات العام في الذاكرة لكل نسخة (حد محاولات الدخول مخزن في القاعدة ويعمل عبر النسخ).

## التحديث

```bash
git pull && docker compose up -d --build   # يطبق migrations الجديدة تلقائيًا
```
خذ نسخة احتياطية قبل أي تحديث.
