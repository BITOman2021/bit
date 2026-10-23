import { formatOMR } from "./money";

export function fmtMoney(v: Parameters<typeof formatOMR>[0], withCurrency = false, locale = "ar") {
  return formatOMR(v, { withCurrency, locale });
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function fmtDateTime(d: Date | null | undefined, locale: "ar" | "en" = "ar", timeZone = "Asia/Muscat"): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-OM-u-nu-latn" : "en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function fmtPercent(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}
