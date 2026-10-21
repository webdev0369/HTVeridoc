/** Normalize PO header dates to ISO YYYY-MM-DD; keep source bbox separately. */

export type DateParts = { y: number; m: number; d: number };

const DATE_FIELD_KEYS = new Set(['documentDate', 'orderDate']);

export function isDateHeaderField(fieldKey: string): boolean {
  return DATE_FIELD_KEYS.has(fieldKey);
}

export function parseDateParts(raw: string | null | undefined): DateParts | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return validParts(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return validParts(Number(m[3]), Number(m[2]), Number(m[1]));

  m = /^(\d{4})[./](\d{1,2})[./](\d{1,2})$/.exec(s);
  if (m) return validParts(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) return validParts(Number(m[3]), Number(m[2]), Number(m[1]));

  return null;
}

function validParts(y: number, m: number, d: number): DateParts | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

export function toIsoDate(parts: DateParts): string {
  const mm = String(parts.m).padStart(2, '0');
  const dd = String(parts.d).padStart(2, '0');
  return `${parts.y}-${mm}-${dd}`;
}

/** ISO if parseable; otherwise original trimmed (or null). */
export function normalizeDateValue(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = parseDateParts(trimmed);
  return parts ? toIsoDate(parts) : trimmed;
}
