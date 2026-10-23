import Link from "next/link";
import { createBuildingAction, createUnitAction, setSharesAction } from "@/app/actions/core";
import { DocumentsPanel } from "@/components/domain/documents-panel";
import { ActionForm, Input, MoneyInput, Select } from "@/components/ui/form";
import { Badge, Card, DataTable, DescList, Empty, Grid, Money, PageHeader, Stat, Tabs } from "@/components/ui/kit";
import { label } from "@/i18n/dict";
import { enumOptions } from "@/i18n/options";
import { getT } from "@/i18n/server";
import { startOfYear, todayInZone } from "@/lib/dates";
import { fmtDate, fmtPercent } from "@/lib/format";
import { requireCtx } from "@/server/auth/next";
import { incomeStatement } from "@/server/services/accounting";
import { getProperty, listOwners } from "@/server/services/properties";
import { listRequests, listWorkOrders } from "@/server/services/maintenance";
import { load, sp, type SP } from "../../_lib/guard";
import { AuditTrail } from "@/components/domain/audit-trail";

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const q = await sp(searchParams);
  const tab = q.tab ?? "overview";
  const { t, L } = await getT();
  const p = await load(getProperty(ctx, id));
  const canWrite = ctx.permissions.has("property.write");
  const occupied = p.units.filter((u) => u.status === "OCCUPIED").length;
  const leasable = p.units.filter((u) => u.status !== "INACTIVE").length;
  const today = todayInZone(ctx.timezone);
  const fin = ctx.permissions.has("finance.read") ? await incomeStatement(ctx, { from: startOfYear(today), to: today, propertyId: id }) : null;
  const base = `/properties/${id}`;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="num">{p.code}</span> · {label(t, "PropertyType", p.type)} · <Badge status={p.status}>{label(t, "PropertyStatus", p.status)}</Badge>
            {p.isDemo && <Badge tone="gold">{t.common.demo}</Badge>}
          </span>
        }
        back={{ href: "/properties", label: t.nav.properties }}
        actions={
          <>
            {canWrite && <Link href={`${base}/edit`} className="btn-secondary">{t.common.edit}</Link>}
            {ctx.permissions.has("lease.write") && <Link href={`/leases/new?propertyId=${id}`} className="btn-primary">+ {L("عقد جديد", "New lease")}</Link>}
          </>
        }
      />
      <Tabs
        current={tab}
        tabs={[
          { key: "overview", label: L("نظرة عامة", "Overview"), href: base },
          { key: "units", label: t.nav.units, href: `${base}?tab=units`, count: p.units.length },
          { key: "owners", label: t.nav.owners, href: `${base}?tab=owners` },
          { key: "maintenance", label: t.nav.maintenance, href: `${base}?tab=maintenance` },
          { key: "documents", label: t.nav.documents, href: `${base}?tab=documents` },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-4">
          <Grid cols={4}>
            <Stat label={t.nav.units} value={<span className="num">{p.units.length}</span>} />
            <Stat label={t.dash.occupancy} tone="gold" value={<span className="num">{fmtPercent(leasable ? (occupied / leasable) * 100 : 0)}</span>} />
            {fin && <Stat label={L("إيرادات السنة", "Income YTD")} tone="success" value={<Money value={fin.totalIncome} />} />}
            {fin && <Stat label={L("صافي الدخل للسنة", "Net income YTD")} value={<Money value={fin.netIncome} tone />} />}
          </Grid>
          <Card title={t.common.details}>
            <DescList
              cols={3}
              items={[
                { label: L("المحافظة / الولاية / المنطقة", "Governorate / Wilayat / Area"), value: [p.governorate, p.wilayat, p.area].filter(Boolean).join(" — ") },
                { label: t.common.address, value: p.address },
                { label: L("رقم القطعة / الكروكي", "Plot / Krooki"), value: [p.plotNumber, p.krookiNumber].filter(Boolean).join(" / ") },
                { label: L("مساحة الأرض / البناء", "Land / built area"), value: <span className="num">{p.landArea?.toString() ?? "—"} / {p.builtArea?.toString() ?? "—"} m²</span> },
                { label: L("المباني / الوحدات", "Buildings / units"), value: <span className="num">{p.buildings.length} / {p.units.length}</span> },
                { label: L("تاريخ وقيمة الشراء", "Purchase date & price"), value: <>{fmtDate(p.purchaseDate)} · <Money value={p.purchasePrice} /></> },
                { label: L("القيمة التقديرية", "Estimated value"), value: <>{p.estimatedValue ? <Money value={p.estimatedValue} /> : "—"} ({fmtDate(p.valuationDate)})</> },
                { label: L("بيانات التمويل", "Financing"), value: p.financingDetails },
                { label: L("التأمين", "Insurance"), value: [p.insuranceProvider, p.insurancePolicyNo, p.insuranceExpiry && `${L("ينتهي", "expires")} ${fmtDate(p.insuranceExpiry)}`].filter(Boolean).join(" · ") },
                { label: L("التوزيع حسب نسب الملكية", "Ownership split"), value: p.ownershipSplitEnabled ? t.common.yes : t.common.no },
                { label: L("ملاحظات داخلية", "Internal notes"), value: p.notes },
              ]}
            />
          </Card>
          {p.serviceContracts.length > 0 && (
            <Card title={L("عقود الخدمات والصيانة", "Service & maintenance contracts")}>
              <ul className="space-y-1 text-sm">
                {p.serviceContracts.map((c) => (
                  <li key={c.id}>
                    <Link className="link" href={`/vendors/${c.vendorId}`}>{c.vendor.name}</Link> — {c.title} ({fmtDate(c.startDate)} → {fmtDate(c.endDate)})
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <AuditTrail entityId={id} t={t} L={L} canSee={ctx.permissions.has("audit.read")} />
        </div>
      )}

      {tab === "units" && (
        <div className="space-y-4">
          <Card bodyClassName="p-0" title={t.nav.units}>
            <DataTable
              rows={p.units}
              rowKey={(u) => u.id}
              empty={<Empty title={L("لا توجد وحدات", "No units")} />}
              cols={[
                { key: "no", label: t.common.unit, primary: true, render: (u) => <Link className="link" href={`/units/${u.id}`}>{u.unitNumber}</Link> },
                { key: "b", label: L("المبنى / الطابق", "Building / floor"), render: (u) => `${u.building?.name ?? "—"} / ${u.floor ? (u.floor.name ?? u.floor.number) : "—"}` },
                { key: "type", label: t.common.type, render: (u) => label(t, "UnitType", u.type) },
                { key: "area", label: L("المساحة", "Area"), render: (u) => <span className="num">{u.area?.toString() ?? "—"}</span> },
                { key: "rooms", label: L("غرف/حمامات", "Bed/bath"), render: (u) => <span className="num">{u.bedrooms ?? "—"}/{u.bathrooms ?? "—"}</span> },
                { key: "tenant", label: t.common.tenant, render: (u) => u.leases[0]?.tenant.name ?? "—" },
                { key: "rent", label: L("الإيجار", "Rent"), render: (u) => <Money value={u.leases[0]?.monthlyRent ?? u.marketRent} /> },
                { key: "status", label: t.common.status, render: (u) => <Badge status={u.status}>{label(t, "UnitStatus", u.status)}</Badge> },
              ]}
            />
          </Card>
          {canWrite && (
            <Grid cols={2}>
              <Card title={L("إضافة وحدة", "Add unit")}>
                <ActionForm action={createUnitAction} submitLabel={t.common.add} pendingLabel={t.common.saving} resetOnSuccess>
                  <input type="hidden" name="propertyId" value={id} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input name="unitNumber" label={L("رقم الوحدة", "Unit number")} required />
                    <Select name="type" label={t.common.type} options={enumOptions(t, "UnitType")} required />
                    <Select name="buildingId" label={L("المبنى", "Building")} placeholder={t.common.none} options={p.buildings.map((b) => ({ value: b.id, label: b.name }))} />
                    <Select name="floorId" label={L("الطابق", "Floor")} placeholder={t.common.none} options={p.buildings.flatMap((b) => b.floors.map((f) => ({ value: f.id, label: `${b.name} — ${f.name ?? f.number}` })))} />
                    <Input name="area" label={L("المساحة (م²)", "Area (m²)")} inputMode="decimal" dir="ltr" />
                    <MoneyInput name="marketRent" label={L("الإيجار المقترح (ر.ع.)", "Market rent (OMR)")} />
                    <Input name="bedrooms" label={L("الغرف", "Bedrooms")} type="number" min={0} />
                    <Input name="bathrooms" label={L("الحمامات", "Bathrooms")} type="number" min={0} />
                    <Select name="furnishing" label={L("الأثاث", "Furnishing")} options={enumOptions(t, "FurnishingStatus")} />
                    <Select name="status" label={t.common.status} options={enumOptions(t, "UnitStatus", ["VACANT", "RESERVED", "UNDER_MAINTENANCE", "INACTIVE"])} />
                  </div>
                </ActionForm>
              </Card>
              <Card title={L("إضافة مبنى", "Add building")}>
                <ActionForm action={createBuildingAction} submitLabel={t.common.add} pendingLabel={t.common.saving} resetOnSuccess>
                  <input type="hidden" name="propertyId" value={id} />
                  <input type="hidden" name="createFloors" value="on" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Input name="code" label={t.common.code} required dir="ltr" />
                    <Input name="name" label={t.common.name} required />
                    <Input name="floorsCount" label={L("عدد الطوابق", "Floors")} type="number" min={1} defaultValue="1" required />
                    <Input name="yearBuilt" label={L("سنة البناء", "Year built")} type="number" />
                  </div>
                </ActionForm>
                {p.buildings.length > 0 && (
                  <ul className="mt-4 space-y-1 text-sm">
                    {p.buildings.map((b) => (
                      <li key={b.id}>
                        <span className="font-semibold">{b.name}</span> <span className="num text-muted">({b.code})</span> — {L("طوابق", "floors")}: <span className="num">{b.floors.length}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Grid>
          )}
        </div>
      )}

      {tab === "owners" && <OwnersTab ctx={ctx} p={p} t={t} L={L} />}
      {tab === "maintenance" && <MaintenanceTab ctx={ctx} id={id} t={t} L={L} />}
      {tab === "documents" && <DocumentsPanel ctx={ctx} t={t} L={L} where={{ propertyId: id }} link={{ propertyId: id }} />}
    </>
  );
}

async function OwnersTab({ ctx, p, t, L }: { ctx: Awaited<ReturnType<typeof requireCtx>>; p: Awaited<ReturnType<typeof getProperty>>; t: Awaited<ReturnType<typeof getT>>["t"]; L: (a: string, e: string) => string }) {
  const owners = ctx.permissions.has("owner.read") ? await listOwners(ctx) : [];
  const current = p.shares.filter((s) => !s.effectiveTo);
  return (
    <div className="space-y-4">
      <Card title={L("نسب الملكية الحالية", "Current ownership")}>
        {current.length === 0 ? (
          <Empty title={L("لم تُحدد نسب ملكية", "No ownership defined")} />
        ) : (
          <ul className="space-y-2">
            {current.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <Link className="link flex-1" href={`/owners/${s.ownerId}`}>{s.owner.name}</Link>
                <div className="h-2 w-40 overflow-hidden rounded-full bg-navy-50">
                  <div className="h-full bg-gold-500" style={{ width: `${Number(s.percentage)}%` }} />
                </div>
                <span className="num w-20 text-end font-semibold">{Number(s.percentage)}%</span>
              </li>
            ))}
          </ul>
        )}
        {p.shares.some((s) => s.effectiveTo) && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-muted">{t.common.history}</summary>
            <ul className="mt-2 space-y-1">
              {p.shares.filter((s) => s.effectiveTo).map((s) => (
                <li key={s.id} className="text-muted">
                  {s.owner.name} — {Number(s.percentage)}% ({fmtDate(s.effectiveFrom)} → {fmtDate(s.effectiveTo)})
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
      {ctx.permissions.has("owner.write") && (
        <Card title={L("تحديد نسب الملكية (يجب أن يساوي المجموع 100%)", "Set ownership shares (must total 100%)")}>
          <ActionForm action={setSharesAction} submitLabel={t.common.save} pendingLabel={t.common.saving}>
            <input type="hidden" name="propertyId" value={p.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input name="effectiveFrom" type="date" label={L("تاريخ السريان", "Effective from")} required />
              <Input name="documentRef" label={L("مرجع المستند (سند الملكية)", "Document reference (title deed)")} />
            </div>
            <div className="mt-3 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <select name="ownerId[]" className="input col-span-2" defaultValue={current[i]?.ownerId ?? ""} aria-label={t.common.owner}>
                    <option value="">{t.common.select}</option>
                    {owners.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <input name="percentage[]" className="input" inputMode="decimal" dir="ltr" placeholder="%" defaultValue={current[i] ? Number(current[i].percentage).toString() : ""} aria-label={t.common.percent} />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{L("النسب السابقة تُغلق في اليوم السابق لتاريخ السريان ولا تُحذف.", "Previous shares are closed the day before and kept as history.")} <Link href="/owners/new" className="link">{L("مالك جديد", "New owner")}</Link></p>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

async function MaintenanceTab({ ctx, id, t, L }: { ctx: Awaited<ReturnType<typeof requireCtx>>; id: string; t: Awaited<ReturnType<typeof getT>>["t"]; L: (a: string, e: string) => string }) {
  if (!ctx.permissions.has("maintenance.read")) return <Empty title={L("لا صلاحية", "No access")} />;
  const [reqs, wos] = await Promise.all([listRequests(ctx, { propertyId: id }), listWorkOrders(ctx, { propertyId: id })]);
  return (
    <Grid cols={2}>
      <Card title={t.nav.requests} actions={<Link className="btn-secondary btn-sm" href={`/maintenance/requests/new?propertyId=${id}`}>+</Link>}>
        {reqs.length === 0 ? <Empty title={t.common.empty} /> : (
          <ul className="divide-y divide-line text-sm">
            {reqs.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <Link className="link" href={`/maintenance/requests/${r.id}`}>{r.number}</Link>
                <span className="flex-1 truncate">{r.title}</span>
                <Badge status={r.status}>{label(t, "RequestStatus", r.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t.nav.workOrders}>
        {wos.length === 0 ? <Empty title={t.common.empty} /> : (
          <ul className="divide-y divide-line text-sm">
            {wos.map((w) => (
              <li key={w.id} className="flex items-center gap-2 py-2">
                <Link className="link" href={`/maintenance/work-orders/${w.id}`}>{w.number}</Link>
                <span className="flex-1 truncate">{w.title}</span>
                <Badge status={w.status}>{label(t, "WorkOrderStatus", w.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Grid>
  );
}
