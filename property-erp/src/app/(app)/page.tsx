import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, Empty, FilterBar, FilterDate, FilterSelect, Money, PageHeader, Stat } from "@/components/ui/kit";
import { getT } from "@/i18n/server";
import { parseDateOnly } from "@/lib/dates";
import { fmtDate, fmtDateTime, fmtPercent } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { getDashboard } from "@/server/services/dashboard";
import { listOwners, listProperties } from "@/server/services/properties";
import { load, sp, type SP } from "./_lib/guard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requireCtx();
  if (!ctx.permissions.has("dashboard.view")) redirect(ctx.permissions.has("workorder.assigned") ? "/maintenance/work-orders" : "/account");
  const { t, L, locale } = await getT();
  const q = await sp(searchParams);
  const safeDate = (s?: string) => {
    try {
      return s ? parseDateOnly(s) : undefined;
    } catch {
      return undefined;
    }
  };
  const d = await load(getDashboard(ctx, { from: safeDate(q.from), to: safeDate(q.to), propertyId: q.propertyId, ownerId: q.ownerId }));
  const [props, owners] = await Promise.all([listProperties(ctx), ctx.permissions.has("owner.read") ? listOwners(ctx) : Promise.resolve([])]);
  const f = d.finance;
  const maxBar = f ? f.byProperty.reduce((m, r) => Math.max(m, Number(r.income), Number(r.expense)), 1) : 1;

  return (
    <>
      <PageHeader
        title={t.nav.dashboard}
        subtitle={
          <>
            {t.common.period}: <span className="num">{fmtDate(d.period.from)}</span> → <span className="num">{fmtDate(d.period.to)}</span> · {t.common.updatedAt}:{" "}
            <span className="num">{fmtDateTime(d.generatedAt, locale, ctx.timezone)}</span>
          </>
        }
      />
      <div className="card mb-5">
        <FilterBar resetHref="/" submitLabel={t.common.apply} resetLabel={t.common.reset}>
          <FilterDate name="from" label={t.common.from} value={q.from} />
          <FilterDate name="to" label={t.common.to} value={q.to} />
          <FilterSelect name="propertyId" label={t.common.property} value={q.propertyId} allLabel={t.common.all} options={props.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))} />
          {owners.length > 0 && <FilterSelect name="ownerId" label={t.common.owner} value={q.ownerId} allLabel={t.common.all} options={owners.map((o) => ({ value: o.id, label: o.name }))} />}
        </FilterBar>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t.dash.properties} value={<span className="num">{d.properties}</span>} href="/properties" />
        <Stat label={t.dash.buildingsUnits} value={<span className="num">{d.buildings} / {d.units.total}</span>} href="/units" />
        <Stat
          label={t.dash.occupancy}
          tone="gold"
          value={<span className="num">{fmtPercent(d.occupancyRate)}</span>}
          hint={
            <>
              {t.dash.occupied} <span className="num">{d.units.occupied}</span> · {t.dash.vacant} <span className="num">{d.units.vacant}</span> · {t.dash.reserved} <span className="num">{d.units.reserved}</span>
            </>
          }
        />
        <Stat label={t.dash.expiring} value={<span className="num">{d.expiringLeases.length}</span>} href="/leases?expiring=60" tone={d.expiringLeases.length ? "danger" : "default"} />
      </div>

      {f ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
          <Stat label={t.dash.rentDue} value={<Money value={f.rentDue} />} />
          <Stat label={t.dash.collected} value={<Money value={f.collected} />} tone="success" href="/finance/payments" />
          <Stat label={t.dash.arrears} value={<Money value={f.arrears} />} tone={f.arrears > 0n ? "danger" : "default"} href="/finance/arrears" />
          <Stat label={t.dash.monthExpenses} value={<Money value={f.monthExpenses} />} href="/finance/expenses" />
          <Stat label={t.dash.yearExpenses} value={<Money value={f.yearExpenses} />} />
          <Stat label={t.dash.netCash} value={<Money value={f.netCashFlow} tone />} tone="gold" />
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">{t.dash.noFinance}</p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label={t.dash.maintenanceOpen} value={<span className="num">{d.maintenance.openRequests}</span>} href="/maintenance/requests" />
        <Stat label={t.dash.workOrdersOpen} value={<span className="num">{d.maintenance.openWorkOrders}</span>} href="/maintenance/work-orders" />
        <Stat label={t.dash.workOrdersOverdue} value={<span className="num">{d.maintenance.overdueWorkOrders}</span>} tone={d.maintenance.overdueWorkOrders ? "danger" : "default"} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {f && (
          <Card title={t.dash.byProperty} className="xl:col-span-2">
            {f.byProperty.length === 0 ? (
              <Empty title={t.common.empty} />
            ) : (
              <ul className="space-y-4" aria-label={t.dash.byProperty}>
                {f.byProperty.map((r, i) => (
                  <li key={r.propertyId}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-semibold">
                        {i < 3 && <Badge tone="gold">#{i + 1}</Badge>} {r.name}
                      </span>
                      <span className="text-xs text-muted">
                        {t.dash.net}: <Money value={r.net} tone />
                      </span>
                    </div>
                    <div className="space-y-1" role="img" aria-label={`${r.name}: ${t.dash.income} ${r.income}, ${t.dash.expenses} ${r.expense}`}>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 rounded-full bg-navy-700" style={{ width: `${Math.max(1, (Number(r.income) / maxBar) * 100)}%` }} />
                        <Money value={r.income} className="text-xs" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 rounded-full bg-gold-500" style={{ width: `${Math.max(1, (Number(r.expense) / maxBar) * 100)}%` }} />
                        <Money value={r.expense} className="text-xs" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-4 rounded-full bg-navy-700" /> {t.dash.income}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-4 rounded-full bg-gold-500" /> {t.dash.expenses}
              </span>
              <span>{L("المصدر: القيود المرحّلة", "Source: posted entries")}</span>
            </div>
          </Card>
        )}

        <Card title={t.dash.alerts}>
          {d.notifications.length === 0 && d.tasks.length === 0 ? (
            <Empty title={L("لا توجد تنبيهات", "No alerts")} />
          ) : (
            <ul className="space-y-2">
              {d.notifications.map((n) => (
                <li key={n.id}>
                  <Link href={n.link ?? "/notifications"} className="block rounded-lg border border-line p-2.5 hover:bg-navy-50">
                    <div className="flex items-center gap-2">
                      <Badge tone={n.severity === "danger" ? "red" : n.severity === "warning" ? "amber" : "blue"}>●</Badge>
                      <span className="text-sm font-semibold">{n.title}</span>
                    </div>
                    {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                  </Link>
                </li>
              ))}
              {d.tasks.map((tk) => (
                <li key={tk.id} className="rounded-lg border border-dashed border-line p-2.5 text-sm">
                  <Badge status={tk.priority}>{tk.dueDate ? fmtDate(tk.dueDate) : "—"}</Badge> {tk.title}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t.dash.expiring} className="xl:col-span-3">
          {d.expiringLeases.length === 0 ? (
            <Empty title={L("لا توجد عقود تنتهي قريبًا", "No leases expiring soon")} />
          ) : (
            <ul className="divide-y divide-line">
              {d.expiringLeases.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/leases/${l.id}`} className="link">
                    {l.number}
                  </Link>
                  <span className="flex-1 truncate">
                    {l.tenant.name} — {l.unit.property.name} / {l.unit.unitNumber}
                  </span>
                  <span className="num text-muted">{fmtDate(l.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
