/**
 * مكتبة المبالغ المالية — الريال العُماني (OMR)
 *
 * السياسة:
 * - جميع الحسابات تتم بعدد صحيح من البيسة (1 ريال = 1000 بيسة)، ولا تُستخدم
 *   أرقام الفاصلة العائمة في أي عملية مالية.
 * - التقريب الموحد: نصف للأعلى بعيدًا عن الصفر (ROUND_HALF_UP) إلى أقرب بيسة.
 * - التوزيع النسبي (نسب الملكية، التقسيط) يستخدم طريقة "أكبر باقٍ" حتى
 *   يساوي مجموع الأجزاء المبلغ الأصلي تمامًا.
 *
 * البيسة تُمثَّل بـ bigint لتجنب أي فقدان للدقة.
 */

export type Baisa = bigint;

export const OMR_DECIMALS = 3;
const SCALE = 1000n;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

const AMOUNT_RE = /^([+-])?(\d+)(?:\.(\d+))?$/;

/** يحوّل قيمة نصية/Decimal إلى بيسة. يرفض أكثر من 3 منازل عشرية ما لم يُطلب التقريب. */
export function toBaisa(value: string | number | bigint | { toString(): string } | null | undefined, opts: { round?: boolean } = {}): Baisa {
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "bigint") return value * SCALE;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new MoneyError("Invalid amount");
    // الأرقام تُحوَّل إلى نص أولًا ثم تُحلَّل بدقة
    value = numberToPlainString(value);
  }
  const str = value.toString().trim().replace(/,/g, "");
  const m = AMOUNT_RE.exec(str);
  if (!m) throw new MoneyError(`Invalid amount: "${str}"`);
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = BigInt(m[2]);
  let frac = m[3] ?? "";
  let roundUp = false;
  if (frac.length > OMR_DECIMALS) {
    if (!opts.round) throw new MoneyError(`Amount has more than ${OMR_DECIMALS} decimal places: "${str}"`);
    roundUp = frac.charCodeAt(OMR_DECIMALS) - 48 >= 5;
    frac = frac.slice(0, OMR_DECIMALS);
  }
  frac = frac.padEnd(OMR_DECIMALS, "0");
  let baisa = intPart * SCALE + BigInt(frac);
  if (roundUp) baisa += 1n;
  return sign * baisa;
}

function numberToPlainString(n: number): string {
  // يتجنب الصيغة الأسية للأعداد الصغيرة/الكبيرة
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

/** يحوّل البيسة إلى نص عشري بثلاث منازل، مثال: 1234500n → "1234.500" */
export function fromBaisa(b: Baisa): string {
  const neg = b < 0n;
  const abs = neg ? -b : b;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(OMR_DECIMALS, "0");
  return `${neg ? "-" : ""}${int.toString()}.${frac}`;
}

export function sum(values: Baisa[]): Baisa {
  return values.reduce((a, b) => a + b, 0n);
}

export function min(a: Baisa, b: Baisa): Baisa {
  return a < b ? a : b;
}

export function max(a: Baisa, b: Baisa): Baisa {
  return a > b ? a : b;
}

export function abs(a: Baisa): Baisa {
  return a < 0n ? -a : a;
}

/**
 * قسمة مع تقريب نصف للأعلى (بعيدًا عن الصفر).
 * numerator / denominator حيث كلاهما bigint.
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError("Division by zero");
  const neg = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return neg ? -rounded : rounded;
}

/** ضرب مبلغ في كسر (num/den) مع التقريب الموحد */
export function mulFraction(amount: Baisa, num: bigint, den: bigint): Baisa {
  return divRoundHalfUp(amount * num, den);
}

/**
 * نسبة مئوية من مبلغ: rate نصي مثل "5" أو "5.25" أو "33.3333".
 * يُحسب بدقة صحيحة ثم يُقرَّب.
 */
export function percentOf(amount: Baisa, rate: string | { toString(): string }): Baisa {
  const { num, den } = parseRatio(rate.toString());
  return mulFraction(amount, num, den * 100n);
}

/** يحلل رقمًا عشريًا نصيًا إلى كسر num/den دقيق */
export function parseRatio(str: string): { num: bigint; den: bigint } {
  const m = AMOUNT_RE.exec(str.trim());
  if (!m) throw new MoneyError(`Invalid ratio: "${str}"`);
  const frac = m[3] ?? "";
  const den = 10n ** BigInt(frac.length);
  const num = (BigInt(m[2]) * den + (frac ? BigInt(frac) : 0n)) * (m[1] === "-" ? -1n : 1n);
  return { num, den };
}

/**
 * توزيع مبلغ حسب أوزان (نسب) باستخدام طريقة أكبر باقٍ.
 * يضمن: مجموع النتائج = المبلغ تمامًا، وكل جزء ضمن بيسة واحدة من قيمته الدقيقة.
 */
export function allocateByWeights(amount: Baisa, weights: (string | { toString(): string })[]): Baisa[] {
  if (weights.length === 0) return [];
  const ratios = weights.map((w) => parseRatio(w.toString()));
  // توحيد المقامات
  const commonDen = ratios.reduce((acc, r) => lcm(acc, r.den), 1n);
  const nums = ratios.map((r) => r.num * (commonDen / r.den));
  if (nums.some((n) => n < 0n)) throw new MoneyError("Weights must be non-negative");
  const total = nums.reduce((a, b) => a + b, 0n);
  if (total === 0n) throw new MoneyError("Weights sum to zero");

  const neg = amount < 0n;
  const absAmount = neg ? -amount : amount;
  const parts = nums.map((n) => (absAmount * n) / total);
  const remainders = nums.map((n, i) => ({ i, r: (absAmount * n) % total }));
  let leftover = absAmount - parts.reduce((a, b) => a + b, 0n);
  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (let k = 0; leftover > 0n; k++, leftover--) {
    parts[remainders[k % remainders.length].i] += 1n;
  }
  return neg ? parts.map((p) => -p) : parts;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b;
}

/** تنسيق للعرض مع فواصل الآلاف: "1,234.500" */
export function formatOMR(value: Baisa | string | { toString(): string } | null | undefined, opts: { withCurrency?: boolean; locale?: string } = {}): string {
  const b = typeof value === "bigint" ? value : toBaisa(value ?? "0", { round: true });
  const [int, frac] = fromBaisa(b).replace("-", "").split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = b < 0n ? "-" : "";
  const num = `${sign}${grouped}.${frac}`;
  if (!opts.withCurrency) return num;
  return opts.locale === "ar" ? `${num} ر.ع.` : `OMR ${num}`;
}

/** للتخزين في Prisma Decimal */
export function toDb(b: Baisa): string {
  return fromBaisa(b);
}

export const ZERO: Baisa = 0n;
