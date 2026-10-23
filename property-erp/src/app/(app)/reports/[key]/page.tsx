import { notFound } from "next/navigation";
import { FilterBar, FilterDate, FilterSelect, Money, PageHeader, Card, Empty } from "@/components/ui/kit";
import { PrintButton } from "@/app/print/print-button";
import { getT } from "@/i18n/server";
import { fmtDateTime, fmtPercent } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { listAccounts } from "@/server/services/banking";
import { listOwners, listProperties } from "@/server/services/properties";
import { getReportDef, runReport, type Cell, type Column, type ReportParams } from "@/server/services/reports";
import { listTenants } from "@/server/services/tenants";
import { load, sp, type SP } from "../../_lib/guard";

function Cellv({ v, c }: { v: Cell | undefined; c: Column }) {
  if (v === null || v === undefined || v === "") return <span className="text-muted"></span>;
  if (c.type === "money") return <Money value={typeof v === "bigint" ? v : String(v)} tone />;
  if (c.type === "percent") return <span className="num">{fmtPercent(Number(v))}</span>;
  if (c.type === "number" || c.type === "date") return <span className="num">{String(v)}</span>;
  return <>{String(v)}</>;
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: SP }) {
  const ctx = await requireCtx();
  const { key } = await params;
  const def = getReportDef(key);
  if (!def) notFound();
  const { t, L, locale } = await getT();
  const q = await sp(searchParams);
  const r = await load(runReport(ctx, key, q as ReportParams));
  const need = (p: keyof ReportParams) => def.params.includes(p);
  const [props, owners, tenants, accounts] = await load(Promise.all([
    need("propertyId") && ctx.permissions.has("property.read") ? listProperties(ctx) : [],
    need("ownerId") && ctx.permissions.has("owner.read") && ctx.roleKey !== "OWNER" ? listOwners(ctx) : [],
    need("tenantId") && ctx.permissions.has("tenant.read") ? listTenants(ctx) : [],
    need("accountId") && ctx.permissions.has("journal.read") ? listAccounts(ctx) : [],
  ]));
  const qs = new URLSearchParams(Object.entries(r.filters)).toString();
  const title = locale === "ar" ? r.titleAr : r.titleEn;
  return (
    <>
      <PageHeader
        title={title}
        subtitle={<>{t.common.generatedAt}: {fmtDateTime(r.generatedAt, locale, ctx.timezone)} · {t.common.filtersUsed}: <span className="num">{Object.entries(r.filters).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}</span></>}
        back={{ href: "/reports", label: t.nav.reports }}
        actions={
          <>
            <a className="btn-secondary" href={`/api/reports/${key}?${qs}&format=csv`}>{t.common.exportCsv}</a>
            <a className="btn-secondary" href={`/api/reports/${key}?${qs}&format=xlsx`}>{t.common.exportXlsx}</a>
            <PrintButton />
          </>
        }
      />
      <div className="card mb-4 no-print">
        <FilterBar resetHref={`/reports/${key}`} submitLabel={t.common.apply} resetLabel={t.common.reset}>
          {need("from") && <FilterDate name="from" label={t.common.from} value={q.from} />}
          {need("to") && <FilterDate name="to" label={t.common.to} value={q.to} />}
          {need("asOf") && <FilterDate name="asOf" label={t.common.asOf} value={q.asOf} />}
          {need("compareFrom") && <FilterDate name="compareFrom" label={L("مقارنة من", "Compare from")} value={q.compareFrom} />}
          {need("compareTo") && <FilterDate name="compareTo" label={L("مقارنة إلى", "Compare to")} value={q.compareTo} />}
          {need("propertyId") && <FilterSelect name="propertyId" label={t.common.property} value={q.propertyId} options={props.map((p) => ({ value: p.id, label: p.name }))} allLabel={t.common.all} />}
          {owners.length > 0 && <FilterSelect name="ownerId" label={t.common.owner} value={q.ownerId} options={owners.map((o) => ({ value: o.id, label: o.name }))} allLabel={t.common.select} />}
          {need("tenantId") && <FilterSelect name="tenantId" label={t.common.tenant} value={q.tenantId} options={tenants.map((x) => ({ value: x.id, label: x.name }))} allLabel={t.common.select} />}
          {need("accountId") && <FilterSelect name="accountId" label={L("الحساب", "Account")} value={q.accountId} options={accounts.map((a) => ({ value: a.id, label: `${a.code} ${locale === "ar" ? a.nameAr : a.nameEn}` }))} allLabel={t.common.select} />}
        </FilterBar>
      </div>
      <div className="print-only mb-4">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-xs">GLOBAL SNOW WING (GSW) — {fmtDateTime(r.generatedAt, locale, ctx.timezone)} — {Object.entries(r.filters).map(([k, v]) => `${k}=${v}`).join(", ")}</p>
      </div>
      <Card bodyClassName="p-0 overflow-x-auto">
        {r.columns.length === 0 || r.rows.length === 0 ? (
          <Empty title={r.notes?.[0] ?? t.common.empty} />
        ) : (
          <table className="dtable">
            <thead><tr>{r.columns.map((c) => <th key={c.key} className={c.type === "money" || c.type === "number" || c.type === "percent" ? "text-end" : ""}>{locale === "ar" ? c.ar : c.en}</th>)}</tr></thead>
            <tbody>
              {r.rows.map((row, i) => (
                <tr key={i}>{r.columns.map((c) => <td key={c.key} className={c.type === "money" || c.type === "number" || c.type === "percent" ? "text-end" : ""}><Cellv v={row[c.key]} c={c} /></td>)}</tr>
              ))}
            </tbody>
            {r.totals && (
              <tfoot className="bg-navy-50 font-bold">
                <tr>{r.columns.map((c) => <td key={c.key} className={`border-t-2 border-navy-700 px-3 py-2.5 ${c.type === "money" || c.type === "number" || c.type === "percent" ? "text-end" : ""}`}><Cellv v={r.totals![c.key]} c={c} /></td>)}</tr>
              </tfoot>
            )}
          </table>
        )}
      </Card>
      {r.notes && r.rows.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted">{r.notes.map((n) => <li key={n}>• {n}</li>)}</ul>}
    </>
  );
}
