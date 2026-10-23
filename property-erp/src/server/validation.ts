import { z } from "zod";
import { isValidDateOnly } from "@/lib/dates";
import { toBaisa } from "@/lib/money";
import { AppError } from "./errors";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v);

export const zStr = (max = 200) => z.preprocess(emptyToUndef, z.string().max(max));
export const zOptStr = (max = 500) => z.preprocess(emptyToUndef, z.string().max(max).optional());
export const zText = (max = 5000) => z.preprocess(emptyToUndef, z.string().max(max).optional());
export const zId = z.preprocess(emptyToUndef, z.string().min(1).max(40));
export const zOptId = z.preprocess(emptyToUndef, z.string().min(1).max(40).optional());

function safeBaisa(v: unknown): bigint | null {
  try {
    return toBaisa(v as string);
  } catch {
    return null;
  }
}
/** مبلغ بالريال العُماني كنص، 3 منازل عشرية كحد أقصى */
export const zMoney = z.preprocess(
  emptyToUndef,
  z.string().refine((v) => safeBaisa(v) !== null, "مبلغ غير صالح (3 منازل عشرية كحد أقصى) / Invalid amount (max 3 decimals)"),
);
export const zPositiveMoney = zMoney.refine((v) => (safeBaisa(v) ?? 0n) > 0n, "يجب أن يكون المبلغ أكبر من صفر / Amount must be greater than zero");
export const zNonNegMoney = zMoney.refine((v) => (safeBaisa(v) ?? 0n) >= 0n, "لا يسمح بمبلغ سالب / Amount cannot be negative");
export const zOptMoney = z.preprocess(emptyToUndef, zNonNegMoney.optional());

export const zDate = z.preprocess(emptyToUndef, z.string().refine(isValidDateOnly, "تاريخ غير صالح / Invalid date"));
export const zOptDate = z.preprocess(emptyToUndef, z.string().refine(isValidDateOnly, "تاريخ غير صالح / Invalid date").optional());
export const zInt = (min = 0, max = 100000) => z.preprocess((v) => (emptyToUndef(v) === undefined ? undefined : Number(v)), z.number().int().min(min).max(max));
export const zOptInt = (min = 0, max = 100000) => z.preprocess((v) => (emptyToUndef(v) === undefined ? undefined : Number(v)), z.number().int().min(min).max(max).optional());
export const zOptDecimal = (maxDecimals = 2) =>
  z.preprocess(emptyToUndef, z.string().regex(new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`), "رقم غير صالح / Invalid number").optional());
export const zBool = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());
export const zEmail = z.preprocess(emptyToUndef, z.string().email("بريد غير صالح / Invalid email").max(200).optional());
export const zPhone = z.preprocess(emptyToUndef, z.string().regex(/^[+\d\s()-]{6,20}$/, "رقم هاتف غير صالح / Invalid phone").optional());

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const details: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join(".") || "_";
      (details[key] ??= []).push(issue.message);
    }
    throw new AppError("VALIDATION", "يرجى تصحيح الحقول المظللة / Please correct the highlighted fields", details);
  }
  return r.data;
}

/** يحوّل FormData إلى كائن (يدعم الحقول المتكررة name[]) */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const value = typeof v === "string" ? v : v;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      ((out[key] as unknown[]) ??= []).push(value);
    } else out[k] = value;
  }
  return out;
}
