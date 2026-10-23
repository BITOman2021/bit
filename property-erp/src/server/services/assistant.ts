/**
 * المساعد الذكي — بنية اختيارية.
 * الوضع الافتراضي: تحليلات قائمة على القواعد من بيانات النظام فقط (لا يُرسل أي شيء لخارج الخادم).
 * كل نتيجة تُظهر مصدر الأرقام والفترة. المساعد لا ينفذ أي إجراء (دفع/تعديل عقد/حذف/إجراء قانوني):
 * يقترح فقط، والقرار والتنفيذ للمستخدم عبر الشاشات العادية وصلاحياته.
 */
import { addDays, formatDateOnly, startOfYear, todayInZone } from "@/lib/dates";
import { formatOMR } from "@/lib/money";
import { assertCan, type Ctx, scopeIn } from "../context";
import { prisma } from "../db";
import { incomeStatement } from "./accounting";
import { arrears } from "./billing";
import { suggestCategory, suggestPriority } from "./maintenance";

export interface Insight {
  kind: "lease" | "arrears" | "expense" | "maintenance" | "summary";
  severity: "info" | "warning" | "danger";
  title: string;
  detail: string;
  source: string;
  period: string;
  link?: string;
  draftMessage?: string;
}

/** واجهة لمزود ذكاء اصطناعي خارجي — غير مفعلة. لا تُرسل بيانات شخصية/مالية دون تكامل معتمد. */
export interface AiProvider {
  summarize(input: { prompt: string; context: string }): Promise<string>;
}
export function externalAiProvider(): AiProvider | null {
  // عمدًا: لا يوجد مزود مفعّل. التفعيل يتطلب تكاملًا معتمدًا ومراجعة الخصوصية والصلاحيات.
  return null;
}

export async function insights(ctx: Ctx, L: (a: string, e: string) => string): Promise<Insight[]> {
  assertCan(ctx, "report.read");
  const today = todayInZone(ctx.timezone);
  const out: Insight[] = [];
  const todayS = formatDateOnly(today);

  if (ctx.permissions.has("lease.read")) {
    const exp = await prisma.lease.findMany({
      where: { organizationId: ctx.orgId, status: "ACTIVE", endDate: { gte: today, lte: addDays(today, 90) }, renewalLease: null, unit: { propertyId: scopeIn(ctx) } },
      include: { tenant: true, unit: { include: { property: true } } },
      orderBy: { endDate: "asc" },
    });
    for (const l of exp) {
      const days = Math.round((l.endDate.getTime() - today.getTime()) / 86400000);
      out.push({
        kind: "lease",
        severity: days <= 30 ? "danger" : "warning",
        title: L(`العقد ${l.number} ينتهي خلال ${days} يومًا دون تجديد`, `Lease ${l.number} ends in ${days} days with no renewal`),
        detail: `${l.tenant.name} — ${l.unit.property.name} / ${l.unit.unitNumber}`,
        source: L("جدول العقود (الحالة: ساري، بدون عقد تجديد)", "Leases table (active, no renewal)"),
        period: `${todayS} → ${formatDateOnly(addDays(today, 90))}`,
        link: `/leases/${l.id}?tab=actions`,
        draftMessage: L(
          `السيد/ة ${l.tenant.name} المحترم/ة،\nنود تذكيركم بأن عقد الإيجار رقم ${l.number} للوحدة ${l.unit.unitNumber} في ${l.unit.property.name} ينتهي بتاريخ ${formatDateOnly(l.endDate)}. يرجى التواصل معنا لبحث رغبتكم في التجديد.\nمع التحية،\nإدارة العقارات`,
          `Dear ${l.tenant.name},\nThis is a reminder that lease ${l.number} for unit ${l.unit.unitNumber} at ${l.unit.property.name} ends on ${formatDateOnly(l.endDate)}. Please contact us regarding renewal.\nKind regards,\nProperty Management`,
        ),
      });
    }
  }

  if (ctx.permissions.has("finance.read")) {
    const arr = await arrears(ctx, { asOf: today });
    const byTenant = new Map<string, { name: string; total: bigint; maxDays: number; leaseId: string }>();
    for (const c of arr) {
      const cur = byTenant.get(c.lease.tenant.id) ?? { name: c.lease.tenant.name, total: 0n, maxDays: 0, leaseId: c.leaseId };
      cur.total += c.balance;
      cur.maxDays = Math.max(cur.maxDays, c.daysOverdue);
      byTenant.set(c.lease.tenant.id, cur);
    }
    for (const [id, v] of [...byTenant.entries()].sort((a, b) => (b[1].total > a[1].total ? 1 : -1)).slice(0, 10)) {
      out.push({
        kind: "arrears",
        severity: v.maxDays > 60 ? "danger" : "warning",
        title: L(`متأخرات ${v.name}: ${formatOMR(v.total)} ر.ع. (أقدمها ${v.maxDays} يومًا)`, `${v.name} arrears: OMR ${formatOMR(v.total)} (oldest ${v.maxDays} days)`),
        detail: L("يُنصح بالمتابعة الودية. أي رسوم تأخير أو إجراء قانوني يتطلب موافقة وفق العقد والأنظمة.", "Follow up courteously. Late fees or legal action need approval per the lease and law."),
        source: L("الاستحقاقات المفتوحة المتجاوزة لتاريخ الاستحقاق", "Open charges past due date"),
        period: L(`حتى ${todayS}`, `as of ${todayS}`),
        link: `/tenants/${id}`,
        draftMessage: L(
          `السيد/ة ${v.name} المحترم/ة،\nنفيدكم بوجود مبلغ مستحق قدره ${formatOMR(v.total)} ر.ع. نرجو التكرم بالسداد أو التواصل معنا لترتيب ذلك. إذا تم السداد مؤخرًا فنرجو تجاهل هذه الرسالة.\nمع التحية،\nقسم التحصيل`,
          `Dear ${v.name},\nOur records show an outstanding balance of OMR ${formatOMR(v.total)}. Please arrange payment or contact us. If already paid, please disregard.\nKind regards,\nCollections`,
        ),
      });
    }

    const props = await prisma.property.findMany({ where: { organizationId: ctx.orgId, archivedAt: null, id: scopeIn(ctx) }, select: { id: true, name: true } });
    for (const p of props) {
      const is = await incomeStatement(ctx, { from: startOfYear(today), to: today, propertyId: p.id });
      if (is.totalIncome > 0n && is.totalExpenses * 100n > is.totalIncome * 40n) {
        const pct = Number((is.totalExpenses * 1000n) / is.totalIncome) / 10;
        out.push({
          kind: "expense",
          severity: pct > 70 ? "danger" : "warning",
          title: L(`نسبة المصروفات إلى الإيرادات في ${p.name}: ${pct}%`, `Expense-to-income ratio at ${p.name}: ${pct}%`),
          detail: L(`الإيرادات ${formatOMR(is.totalIncome)} — المصروفات ${formatOMR(is.totalExpenses)} ر.ع. راجع أكبر بنود المصروفات.`, `Income ${formatOMR(is.totalIncome)} — expenses ${formatOMR(is.totalExpenses)}. Review the largest items.`),
          source: L("القيود المرحّلة (قائمة الدخل للعقار)", "Posted entries (property P&L)"),
          period: `${formatDateOnly(startOfYear(today))} → ${todayS}`,
          link: `/reports/profit-loss?propertyId=${p.id}&from=${formatDateOnly(startOfYear(today))}`,
        });
      }
    }
  }

  if (ctx.permissions.has("maintenance.read")) {
    const stale = await prisma.maintenanceRequest.findMany({
      where: { organizationId: ctx.orgId, status: "NEW", createdAt: { lt: addDays(today, -3) }, propertyId: scopeIn(ctx) },
      take: 20,
    });
    for (const r of stale) {
      const cat = suggestCategory(`${r.title} ${r.description}`);
      const pri = suggestPriority(`${r.title} ${r.description}`);
      out.push({
        kind: "maintenance",
        severity: pri === "URGENT" ? "danger" : "warning",
        title: L(`طلب الصيانة ${r.number} بدون أمر عمل منذ أكثر من 3 أيام`, `Request ${r.number} has no work order for 3+ days`),
        detail: L(`التصنيف المقترح: ${cat} · الأولوية المقترحة: ${pri} (اقتراح آلي بالكلمات المفتاحية)`, `Suggested category: ${cat} · priority: ${pri} (keyword-based)`),
        source: L("طلبات الصيانة بحالة جديد", "Maintenance requests in NEW status"),
        period: L(`أنشئ ${formatDateOnly(r.createdAt)}`, `created ${formatDateOnly(r.createdAt)}`),
        link: `/maintenance/requests/${r.id}`,
      });
    }
  }
  return out;
}

/** بحث نصي (عربي/إنجليزي) ضمن البيانات المسموح بها فقط */
export async function searchAll(ctx: Ctx, q: string) {
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return [];
  const ci = { contains: term, mode: "insensitive" as const };
  const results: { type: string; title: string; href: string }[] = [];
  if (ctx.permissions.has("property.read")) {
    for (const p of await prisma.property.findMany({ where: { organizationId: ctx.orgId, id: scopeIn(ctx), OR: [{ name: ci }, { code: ci }, { wilayat: ci }, { area: ci }] }, take: 10 })) results.push({ type: "property", title: `${p.code} ${p.name}`, href: `/properties/${p.id}` });
    for (const u of await prisma.unit.findMany({ where: { property: { organizationId: ctx.orgId }, propertyId: scopeIn(ctx), unitNumber: ci }, include: { property: true }, take: 10 })) results.push({ type: "unit", title: `${u.property.code} / ${u.unitNumber}`, href: `/units/${u.id}` });
  }
  if (ctx.permissions.has("tenant.read")) {
    for (const t of await prisma.tenant.findMany({ where: { organizationId: ctx.orgId, OR: [{ name: ci }, { code: ci }, { phone: ci }], ...(ctx.propertyIds === null ? {} : { leases: { some: { unit: { propertyId: { in: ctx.propertyIds } } } } }) }, take: 10 })) results.push({ type: "tenant", title: t.name, href: `/tenants/${t.id}` });
  }
  if (ctx.permissions.has("lease.read")) {
    for (const l of await prisma.lease.findMany({ where: { organizationId: ctx.orgId, number: ci, unit: { propertyId: scopeIn(ctx) } }, take: 10 })) results.push({ type: "lease", title: l.number, href: `/leases/${l.id}` });
  }
  if (ctx.permissions.has("finance.read")) {
    for (const r of await prisma.receipt.findMany({ where: { organizationId: ctx.orgId, number: ci }, take: 5 })) results.push({ type: "receipt", title: r.number, href: `/finance/payments/${r.paymentId}` });
  }
  if (ctx.permissions.has("maintenance.read")) {
    for (const w of await prisma.workOrder.findMany({ where: { organizationId: ctx.orgId, propertyId: scopeIn(ctx), OR: [{ number: ci }, { title: ci }] }, take: 10 })) results.push({ type: "work order", title: `${w.number} ${w.title}`, href: `/maintenance/work-orders/${w.id}` });
  }
  return results;
}
