/**
 * كتالوج الصلاحيات والأدوار الافتراضية.
 * تُفرض الصلاحيات في طبقة الخدمات على الخادم (وليس بإخفاء الأزرار فقط).
 */

export const PERMISSIONS = {
  "dashboard.view": ["عرض لوحة التحكم", "View dashboard"],
  "property.read": ["عرض العقارات والوحدات", "View properties and units"],
  "property.write": ["إدارة العقارات والوحدات", "Manage properties and units"],
  "owner.read": ["عرض الملاك", "View owners"],
  "owner.write": ["إدارة الملاك ونسب الملكية", "Manage owners and ownership shares"],
  "tenant.read": ["عرض المستأجرين", "View tenants"],
  "tenant.write": ["إدارة المستأجرين", "Manage tenants"],
  "tenant.sensitive": ["عرض البيانات والمستندات الحساسة للمستأجر", "View sensitive tenant data and documents"],
  "lease.read": ["عرض العقود", "View leases"],
  "lease.write": ["إنشاء وتعديل العقود", "Create and edit leases"],
  "lease.approve": ["اعتماد/إنهاء العقود", "Approve/terminate leases"],
  "finance.read": ["عرض البيانات المالية", "View financial data"],
  "payment.write": ["تسجيل التحصيلات", "Record collections"],
  "payment.void": ["إلغاء التحصيلات", "Void collections"],
  "charge.write": ["إضافة/إلغاء استحقاقات", "Add/void charges"],
  "expense.write": ["تسجيل المصروفات", "Record expenses"],
  "invoice.write": ["إدارة فواتير الموردين ودفعاتها", "Manage vendor invoices and payments"],
  "refund.write": ["طلب المبالغ المستردة", "Request refunds"],
  "journal.read": ["عرض القيود ودفتر الأستاذ", "View journal and ledger"],
  "journal.write": ["إنشاء قيود يدوية وعكسها", "Create and reverse manual entries"],
  "accounts.manage": ["إدارة دليل الحسابات والبنوك", "Manage chart of accounts and banks"],
  "bank.reconcile": ["التسويات البنكية", "Bank reconciliation"],
  "approval.decide": ["اعتماد/رفض الطلبات المالية", "Approve/reject requests"],
  "maintenance.read": ["عرض الصيانة", "View maintenance"],
  "maintenance.write": ["إدارة طلبات وأوامر الصيانة", "Manage maintenance requests and work orders"],
  "workorder.assigned": ["تنفيذ أوامر العمل المسندة", "Work on assigned work orders"],
  "asset.write": ["إدارة الأصول", "Manage assets"],
  "vendor.read": ["عرض الموردين", "View vendors"],
  "vendor.write": ["إدارة الموردين والمشتريات", "Manage vendors and purchasing"],
  "document.read": ["عرض المستندات", "View documents"],
  "document.write": ["رفع وأرشفة المستندات", "Upload and archive documents"],
  "report.read": ["عرض التقارير", "View reports"],
  "task.write": ["إدارة المهام", "Manage tasks"],
  "user.manage": ["إدارة المستخدمين والأدوار", "Manage users and roles"],
  "settings.manage": ["إدارة إعدادات النظام", "Manage system settings"],
  "audit.read": ["عرض سجل التدقيق", "View audit log"],
  "portal.tenant": ["بوابة المستأجر", "Tenant portal"],
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];
const without = (...p: Permission[]) => ALL.filter((x) => !p.includes(x) && x !== "portal.tenant");

export const ROLES: Record<string, { nameAr: string; nameEn: string; permissions: Permission[] }> = {
  ADMIN: { nameAr: "مدير النظام", nameEn: "System administrator", permissions: without() },
  OWNER: {
    nameAr: "مالك العقارات",
    nameEn: "Property owner",
    permissions: ["dashboard.view", "property.read", "owner.read", "lease.read", "finance.read", "maintenance.read", "report.read", "document.read"],
  },
  PROPERTY_MANAGER: {
    nameAr: "مدير العقارات",
    nameEn: "Property manager",
    permissions: without("user.manage", "settings.manage", "accounts.manage", "journal.write", "bank.reconcile"),
  },
  ACCOUNTANT: {
    nameAr: "المحاسب",
    nameEn: "Accountant",
    permissions: [
      "dashboard.view", "property.read", "owner.read", "tenant.read", "lease.read", "finance.read", "payment.write", "payment.void",
      "charge.write", "expense.write", "invoice.write", "refund.write", "journal.read", "journal.write", "accounts.manage", "bank.reconcile",
      "vendor.read", "document.read", "document.write", "report.read", "maintenance.read", "task.write",
    ],
  },
  MAINTENANCE_MANAGER: {
    nameAr: "مسؤول الصيانة",
    nameEn: "Maintenance manager",
    permissions: ["dashboard.view", "property.read", "tenant.read", "maintenance.read", "maintenance.write", "workorder.assigned", "asset.write", "vendor.read", "vendor.write", "document.read", "document.write", "report.read", "task.write"],
  },
  COLLECTOR: {
    nameAr: "موظف التحصيل",
    nameEn: "Collections officer",
    permissions: ["dashboard.view", "property.read", "tenant.read", "lease.read", "finance.read", "payment.write", "document.read", "report.read", "task.write"],
  },
  LEASING: {
    nameAr: "موظف التأجير",
    nameEn: "Leasing officer",
    permissions: ["dashboard.view", "property.read", "tenant.read", "tenant.write", "tenant.sensitive", "lease.read", "lease.write", "document.read", "document.write", "maintenance.read", "task.write"],
  },
  TECHNICIAN: {
    nameAr: "الفني",
    nameEn: "Technician",
    // الفني يرى أوامر العمل المسندة إليه فقط
    permissions: ["workorder.assigned"],
  },
  TENANT: { nameAr: "المستأجر", nameEn: "Tenant", permissions: ["portal.tenant"] },
  AUDITOR: {
    nameAr: "المراجع المالي",
    nameEn: "Financial auditor",
    permissions: ["dashboard.view", "property.read", "owner.read", "tenant.read", "lease.read", "finance.read", "journal.read", "vendor.read", "report.read", "audit.read", "document.read", "maintenance.read"],
  },
};

export type RoleKey = keyof typeof ROLES;
