import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { requireCtx } from "@/server/auth/next";
import { listReportDefs } from "@/server/services/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("report.read")) redirect("/forbidden");
  const { t, L, locale } = await getT();
  const defs = listReportDefs(ctx);
  const groups = [
    { key: "operations", label: L("التشغيل والإشغال", "Operations & occupancy") },
    { key: "finance", label: L("المالية والتحصيل", "Finance & collections") },
    { key: "accounting", label: L("المحاسبة", "Accounting") },
    { key: "maintenance", label: L("الصيانة والضمانات", "Maintenance & warranties") },
  ];
  return (
    <>
      <PageHeader title={t.nav.reports} subtitle={L("كل الأرقام مستخرجة من السجلات والقيود الفعلية؛ تتضمن التقارير الفلاتر وتاريخ الاستخراج.", "All figures come from actual records and entries; reports include filters and generation time.")} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map((g) => {
          const list = defs.filter((d) => d.group === g.key);
          if (!list.length) return null;
          return (
            <Card key={g.key} title={g.label}>
              <ul className="grid grid-cols-1 gap-2">
                {list.map((d) => (
                  <li key={d.key}>
                    <Link href={`/reports/${d.key}`} className="block rounded-lg border border-line px-3 py-2.5 text-sm font-semibold text-navy-900 hover:border-gold-500 hover:bg-gold-100/40">
                      {locale === "ar" ? d.titleAr : d.titleEn}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
