import Link from "next/link";
import type { ReactNode } from "react";
import { fmtMoney } from "@/lib/format";

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="no-print mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-navy-700">
            <span aria-hidden className="rtl:rotate-180">←</span> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold text-navy-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", bodyClassName = "p-4 sm:p-5" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          {title && <h2 className="text-base font-bold text-navy-900">{title}</h2>}
          {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  green: "bg-success-bg text-success",
  amber: "bg-warning-bg text-warning",
  red: "bg-danger-bg text-danger",
  blue: "bg-info-bg text-info",
  gray: "bg-navy-50 text-muted",
  gold: "bg-gold-100 text-gold-700",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  ACTIVE: "green", OCCUPIED: "green", PAID: "green", POSTED: "green", HELD: "green", APPROVED: "green", COMPLETED: "green", CLOSED: "gray", DONE: "green", RESOLVED: "green", ANSWERED: "green",
  VACANT: "blue", OPEN: "blue", NEW: "blue", ASSIGNED: "blue", DRAFT: "gray", IN_PROGRESS: "amber", PENDING: "amber", PENDING_APPROVAL: "amber", PARTIAL: "amber", PARTIALLY_PAID: "amber", PARTIALLY_REFUNDED: "amber", RESERVED: "gold",
  UNDER_MAINTENANCE: "amber", EXPIRED: "gray", TERMINATED: "red", CANCELLED: "gray", VOID: "gray", VOIDED: "gray", REJECTED: "red", INACTIVE: "gray", REFUNDED: "gray", TRANSFERRED: "gray",
  URGENT: "red", HIGH: "amber", MEDIUM: "blue", LOW: "gray",
};

export function Badge({ children, tone, status }: { children: ReactNode; tone?: keyof typeof TONES; status?: string }) {
  const t = tone ?? (status ? STATUS_TONE[status] : undefined) ?? "gray";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[t]}`}>{children}</span>;
}

export function Money({ value, currency = false, className = "", tone }: { value: Parameters<typeof fmtMoney>[0]; currency?: boolean; className?: string; tone?: boolean }) {
  const s = fmtMoney(value, false);
  const neg = s.startsWith("-");
  return (
    <span className={`num ${tone && neg ? "text-danger" : ""} ${className}`}>
      {s}
      {currency && <span className="ms-1 text-xs text-muted">OMR</span>}
    </span>
  );
}

export function Stat({ label, value, hint, href, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: "default" | "gold" | "danger" | "success" }) {
  const accent = { default: "border-s-navy-700", gold: "border-s-gold-500", danger: "border-s-danger", success: "border-s-success" }[tone];
  const body = (
    <div className={`kpi h-full border-s-4 ${accent} ${href ? "transition hover:shadow-md" : ""}`}>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="mt-1.5 text-xl font-bold text-navy-900 sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-2xl text-gold-700" aria-hidden>
        ◇
      </div>
      <p className="font-semibold text-navy-900">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export interface Col<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** يظهر كعنوان البطاقة على الهاتف */
  primary?: boolean;
  /** يُخفى في عرض البطاقات */
  hideOnMobile?: boolean;
  align?: "end";
}

/** جدول متجاوب: جدول قابل للتمرير على الشاشات الواسعة، وبطاقات على الهاتف */
export function DataTable<T>({ rows, cols, rowKey, empty, footer }: { rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; empty?: ReactNode; footer?: ReactNode }) {
  if (rows.length === 0) return <>{empty ?? <Empty title="—" />}</>;
  const primary = cols.find((c) => c.primary) ?? cols[0];
  return (
    <>
      <div className="hidden max-h-[70vh] overflow-auto md:block">
        <table className="dtable">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.align === "end" ? "text-end" : ""}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)}>
                {cols.map((c) => (
                  <td key={c.key} className={`${c.className ?? ""} ${c.align === "end" ? "text-end" : ""}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className="bg-navy-50 font-bold">{footer}</tfoot>}
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="px-4 py-3">
            <div className="mb-1.5 font-semibold text-navy-900">{primary.render(r)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {cols
                .filter((c) => c !== primary && !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-muted">{c.label}</dt>
                    <dd className="truncate">{c.render(r)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

/** شريط بحث وتصفية يعمل عبر GET (يعمل دون JavaScript ويُحفظ في الرابط) */
export function FilterBar({ children, searchLabel, resetHref, q, submitLabel, resetLabel }: { children?: ReactNode; searchLabel?: string; resetHref: string; q?: string; submitLabel: string; resetLabel: string }) {
  return (
    <form method="get" className="no-print flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:flex-wrap sm:items-end">
      {searchLabel !== undefined && (
        <div className="min-w-0 flex-1 sm:min-w-[220px]">
          <label className="sr-only" htmlFor="q">
            {searchLabel}
          </label>
          <input id="q" name="q" defaultValue={q} placeholder={searchLabel} className="input" type="search" enterKeyHint="search" />
        </div>
      )}
      {children}
      <div className="flex gap-2">
        <button className="btn-primary" type="submit">
          {submitLabel}
        </button>
        <Link className="btn-ghost" href={resetHref}>
          {resetLabel}
        </Link>
      </div>
    </form>
  );
}

export function FilterSelect({ name, label, value, options, allLabel }: { name: string; label: string; value?: string; options: { value: string; label: string }[]; allLabel: string }) {
  return (
    <div className="sm:w-48">
      <label className="mb-1 block text-xs font-semibold text-muted" htmlFor={`flt-${name}`}>
        {label}
      </label>
      <select id={`flt-${name}`} name={name} defaultValue={value ?? ""} className="input">
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterDate({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <div className="sm:w-44">
      <label className="mb-1 block text-xs font-semibold text-muted" htmlFor={`flt-${name}`}>
        {label}
      </label>
      <input id={`flt-${name}`} type="date" name={name} defaultValue={value} className="input" />
    </div>
  );
}

export function DescList({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${grid}`}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-semibold text-muted">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav className="no-print -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${t.key === current ? "border-gold-500 text-navy-900" : "border-transparent text-muted hover:text-navy-700"}`}
        >
          {t.label}
          {t.count !== undefined && <span className="ms-1.5 rounded-full bg-navy-50 px-1.5 text-xs">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  const cls = { info: "bg-info-bg text-info", warning: "bg-warning-bg text-warning", danger: "bg-danger-bg text-danger", success: "bg-success-bg text-success" }[tone];
  return <div className={`rounded-lg px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 | 4 }) {
  const c = { 1: "grid-cols-1", 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4" }[cols];
  return <div className={`grid gap-3 sm:gap-4 ${c}`}>{children}</div>;
}
