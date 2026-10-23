import { addDays, addMonths, diffDays, formatDateOnly, minDate } from "./dates";
import { type Baisa, mulFraction, percentOf } from "./money";

export type Frequency = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";

export const MONTHS_PER_PERIOD: Record<Frequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

export interface ScheduleInput {
  startDate: Date;
  endDate: Date;
  monthlyRent: Baisa;
  frequency: Frequency;
  /** نسبة الضريبة كنص، مثال "0" أو "5" */
  vatRate?: string;
}

export interface SchedulePeriod {
  index: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  fullMonths: number;
  extraDays: number;
  netAmount: Baisa;
  taxAmount: Baisa;
  amount: Baisa;
}

/**
 * يولّد جدول استحقاقات الإيجار.
 * - الإيجار مستحق مقدمًا في بداية كل فترة.
 * - كل فترة = عدد أشهر حسب التكرار، تُحسب دائمًا من تاريخ البداية الأصلي (لا انجراف).
 * - الفترة الأخيرة الجزئية: أشهر كاملة × الإيجار الشهري + أيام متبقية × (الإيجار الشهري / أيام ذلك الشهر)
 *   مع التقريب الموحد إلى أقرب بيسة.
 */
export function generateRentSchedule(input: ScheduleInput): SchedulePeriod[] {
  const { startDate, endDate, monthlyRent, frequency } = input;
  if (endDate < startDate) throw new Error("End date before start date");
  if (monthlyRent < 0n) throw new Error("Negative rent");
  const m = MONTHS_PER_PERIOD[frequency];
  const periods: SchedulePeriod[] = [];
  for (let k = 0; ; k++) {
    const periodStart = addMonths(startDate, k * m);
    if (periodStart > endDate) break;
    const nominalEnd = addDays(addMonths(startDate, (k + 1) * m), -1);
    const periodEnd = minDate(nominalEnd, endDate);

    let fullMonths = 0;
    while (fullMonths < m && addDays(addMonths(startDate, k * m + fullMonths + 1), -1) <= periodEnd) {
      fullMonths++;
    }
    let extraDays = 0;
    let net = monthlyRent * BigInt(fullMonths);
    if (fullMonths < m) {
      const partStart = addMonths(startDate, k * m + fullMonths);
      const nextMonth = addMonths(startDate, k * m + fullMonths + 1);
      extraDays = diffDays(partStart, periodEnd) + 1;
      const span = diffDays(partStart, nextMonth);
      if (extraDays > 0) net += mulFraction(monthlyRent, BigInt(extraDays), BigInt(span));
    }
    const tax = input.vatRate ? percentOf(net, input.vatRate) : 0n;
    periods.push({
      index: k,
      periodStart,
      periodEnd,
      dueDate: periodStart,
      fullMonths,
      extraDays,
      netAmount: net,
      taxAmount: tax,
      amount: net + tax,
    });
    if (periods.length > 1200) throw new Error("Schedule too long");
  }
  return periods;
}

export function describePeriod(p: SchedulePeriod): string {
  return `${formatDateOnly(p.periodStart)} → ${formatDateOnly(p.periodEnd)}`;
}
