/**
 * التواريخ: تُخزَّن تواريخ الاستحقاق والعقود كتاريخ فقط (DATE) بتوقيت UTC منتصف الليل.
 * "اليوم" يُحسب حسب منطقة المنظمة الزمنية (Asia/Muscat افتراضيًا).
 */

export type DateOnly = string; // YYYY-MM-DD

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(s: string): Date {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (formatDateOnly(d) !== s) throw new Error(`Invalid date: ${s}`);
  return d;
}

export function isValidDateOnly(s: string): boolean {
  try {
    parseDateOnly(s);
    return true;
  } catch {
    return false;
  }
}

export function formatDateOnly(d: Date): DateOnly {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** إضافة أشهر مع تثبيت نهاية الشهر (31 يناير + 1 شهر = 28/29 فبراير) */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const targetY = y + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonth(targetY, targetM));
  return new Date(Date.UTC(targetY, targetM, day));
}

export function addPeriod(d: Date, unit: "DAY" | "WEEK" | "MONTH" | "YEAR", interval: number): Date {
  switch (unit) {
    case "DAY":
      return addDays(d, interval);
    case "WEEK":
      return addDays(d, interval * 7);
    case "MONTH":
      return addMonths(d, interval);
    case "YEAR":
      return addMonths(d, interval * 12);
  }
}

/** عدد الأيام بين تاريخين (b - a) */
export function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function todayInZone(timeZone = "Asia/Muscat", now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parseDateOnly(parts);
}

export function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function startOfYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

export function minDate(a: Date, b: Date): Date {
  return a < b ? a : b;
}
