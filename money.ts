/**
 * Money helpers. All amounts are integers in the smallest unit (agorot / cents).
 * Never store or compute money with floats.
 */

export type Minor = number;

/** Parse a user-typed amount ("12", "12.5", "12.50", "1,234.5") into minor units. */
export function toMinor(input: string | number): Minor {
  const text = String(input).trim().replace(/,/g, '');
  const match = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) throw new Error(`Invalid amount: "${input}"`);
  const [, sign, whole, frac = ''] = match;
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return sign ? -minor : minor;
}

export function assertMinor(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer in minor units, got ${value}`);
}

/** Format minor units for display, e.g. formatMoney(5000, 'ILS', 'he') → "‏50.00 ₪". */
export function formatMoney(minor: Minor, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}

/**
 * Split `total` into `count` integer parts that sum exactly to `total`.
 * The remainder goes one unit at a time to the first parts, so the result is
 * deterministic for a given order. Callers sort participants by id first.
 * Must stay in sync with public.split_evenly() in the SQL migration.
 */
export function splitEvenly(total: Minor, count: number): Minor[] {
  assertMinor(total, 'total');
  if (!Number.isInteger(count) || count <= 0) throw new Error('count must be a positive integer');
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
