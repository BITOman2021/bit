# GLOBAL PROPERTY MANAGEMENT ERP

**نظام متكامل لإدارة العقارات والممتلكات والصيانة والحسابات — شركة GLOBAL SNOW WING (GSW) — سلطنة عُمان**

تطبيق ويب متجاوب وقابل للتثبيت (PWA) يعمل بالعربية (RTL) والإنجليزية (LTR)، والعملة الأساسية هي الريال العُماني (OMR)
بثلاث منازل عشرية.

---

## المحتويات

| الدليل | الملف |
|---|---|
| التشغيل على Windows وmacOS وLinux | [docs/SETUP.md](docs/SETUP.md) |
| إعداد قاعدة البيانات | [docs/DATABASE.md](docs/DATABASE.md) |
| النشر على خادم | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| النسخ الاحتياطي والاستعادة | [docs/BACKUP.md](docs/BACKUP.md) |
| دليل المستخدم | [docs/USER_GUIDE.md](docs/USER_GUIDE.md) |
| الأدوار والصلاحيات | [docs/ROLES.md](docs/ROLES.md) |
| المحاسبة والدقة المالية | [docs/ACCOUNTING.md](docs/ACCOUNTING.md) |
| الأمان | [docs/SECURITY.md](docs/SECURITY.md) |
| واجهات API | [docs/API.md](docs/API.md) |
| سجل الوظائف المكتملة وغير المكتملة | [docs/STATUS.md](docs/STATUS.md) |
| نتائج الاختبارات | [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) |

## البدء السريع (تطوير)

```bash
# المتطلبات: Node.js 22+، pnpm 10+، PostgreSQL 16
cd property-erp
cp .env.example .env            # عدّل DATABASE_URL و APP_SECRET
pnpm install
pnpm db:deploy                  # تطبيق migrations
pnpm admin:create               # إنشاء المنظمة وحساب المدير الأول (تفاعلي وآمن)
pnpm db:seed-demo               # اختياري: بيانات تجريبية (التطوير فقط)
pnpm dev                        # http://localhost:3000
```

## التقنيات والإصدارات المستخدمة

| المكوّن | الإصدار |
|---|---|
| Node.js | 22.x |
| Next.js (App Router, Server Actions) | 16.3.8 |
| React / React DOM | 19.2.9 |
| TypeScript | 5.9.3 |
| Tailwind CSS | 4.3.3 |
| Prisma ORM + @prisma/adapter-pg | 7.10.1 |
| PostgreSQL | 16 |
| Zod | 4.6.7 |
| ExcelJS (تصدير Excel) | 4.4.0 |
| lucide-react (الأيقونات) | 1.61.0 |
| Vitest | 4.1.12 |
| Playwright | 1.64.1 |
| pnpm | 10.28.0 |

اختيرت أحدث الإصدارات **المستقرة** وقت التنفيذ (أكتوبر 2026)، مع تجنب الإصدارات التجريبية:
استُخدم Prisma 7.10 بدل Prisma 8 (ما زال RC)، وNext.js 16.3 بدل 16.4 (صدر قبل أيام)، وTypeScript 5.9 بدل 7.0
(لم يتم التحقق من توافقه مع Next.js).

## هيكل المشروع

```
property-erp/
├── prisma/                 مخطط قاعدة البيانات + migrations (تتضمن قيود سلامة مالية بـ SQL)
├── src/
│   ├── app/                الصفحات (App Router) + Server Actions + واجهات API
│   │   ├── (auth)/         تسجيل الدخول والتهيئة الأولى
│   │   ├── (app)/          تطبيق الموظفين (لوحة التحكم، العقارات، العقود، المالية، الصيانة…)
│   │   ├── portal/         بوابة المستأجر
│   │   ├── print/          صفحات الطباعة / PDF (العقد، الإيصال)
│   │   └── api/            REST: التقارير، المستندات، الصحة، v1
│   ├── components/         نظام التصميم والمكونات
│   ├── i18n/               القاموس العربي/الإنجليزي
│   ├── lib/                المال (بيسة صحيحة)، التواريخ، جدول الاستحقاقات، التخصيص
│   └── server/             طبقة الأعمال: الخدمات، الصلاحيات، الجلسات، التدقيق، التخزين
├── scripts/                إنشاء المدير، البيانات التجريبية، المهام الدورية، النسخ الاحتياطي
├── tests/                  وحدات + تكامل (PostgreSQL حقيقي) + واجهة (Playwright)
├── docs/                   الأدلة
├── Dockerfile / docker-compose.yml
└── .env.example
```

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `pnpm dev` | خادم التطوير |
| `pnpm build && pnpm start` | بناء وتشغيل الإنتاج |
| `pnpm typecheck` | فحص الأنواع |
| `pnpm test:unit` | اختبارات الوحدات |
| `pnpm test:integration` | اختبارات التكامل (تمسح قاعدة الاختبار `TEST_DATABASE_URL`) |
| `pnpm test:e2e` | اختبارات الواجهة بالمتصفح |
| `pnpm db:deploy` | تطبيق migrations |
| `pnpm admin:create` | إنشاء المدير الأول (أو `--additional` لمدير إضافي) |
| `pnpm db:seed-demo` / `pnpm db:purge-demo --yes` | إضافة/حذف البيانات التجريبية (يرفض العمل في الإنتاج) |
| `pnpm jobs:notifications` | المهام اليومية: انتهاء العقود، الصيانة الوقائية، التنبيهات |
| `scripts/backup/backup.sh` | نسخة احتياطية مشفرة |
| `scripts/backup/verify-restore.sh` | اختبار استعادة فعلي ومقارنة السلامة |

## مبادئ أساسية في التصميم

- **الدقة المالية:** كل المبالغ تُحسب بعدد صحيح من البيسة (`bigint`)، وتُخزن `NUMERIC(18,3)`. لا أرقام عائمة.
- **قيد مزدوج حقيقي:** كل عملية مالية تُرحّل قيدًا متوازنًا داخل معاملة واحدة، وتتحقق قاعدة البيانات نفسها من التوازن.
- **لا تعديل صامت:** القيود المرحّلة وسجل التدقيق محميان بمشغلات قاعدة البيانات؛ التصحيح بقيد عكسي فقط.
- **لا تكرار:** مفاتيح منع التكرار للدفعات، ومفاتيح مصدر فريدة للقيود، وأقفال صفوف عند التخصيص.
- **الصلاحيات على الخادم:** كل خدمة تتحقق من الصلاحية ونطاق العقارات قبل أي قراءة أو كتابة.
- **لا ادعاءات:** القنوات الخارجية (البريد، واتساب، الرسائل، الدفع الإلكتروني، الذكاء الاصطناعي الخارجي، التوقيع
  الإلكتروني) مُهيأة كبنية فقط ومعطلة حتى يُربط مزود حقيقي ويُختبر. راجع [docs/STATUS.md](docs/STATUS.md).
