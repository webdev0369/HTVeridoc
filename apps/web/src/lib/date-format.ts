/** Calendar date parts (local, no timezone). */
export type DateParts = { y: number; m: number; d: number };

const DATE_FIELD_KEYS = new Set(['documentDate', 'orderDate']);

export function isDateFieldKey(fieldKey: string | null | undefined): boolean {
  return Boolean(fieldKey && DATE_FIELD_KEYS.has(fieldKey));
}

export function parseDateParts(raw: string | null | undefined): DateParts | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    return validParts(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  // DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY (EU / Nordic POs)
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) {
    return validParts(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  // YYYY.MM.DD / YYYY/MM/DD
  m = /^(\d{4})[./](\d{1,2})[./](\d{1,2})$/.exec(s);
  if (m) {
    return validParts(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  // Compact DDMMYYYY
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) {
    return validParts(Number(m[3]), Number(m[2]), Number(m[1]));
  }
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

/** Canonical storage / UI value: YYYY-MM-DD. */
export function toIsoDate(parts: DateParts): string {
  const mm = String(parts.m).padStart(2, '0');
  const dd = String(parts.d).padStart(2, '0');
  return `${parts.y}-${mm}-${dd}`;
}

/**
 * Normalize any supported printed/ISO date to YYYY-MM-DD.
 * Returns original trimmed string if it is not a recognizable date.
 */
export function normalizeDateInput(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = parseDateParts(trimmed);
  return parts ? toIsoDate(parts) : trimmed;
}

export function sameCalendarDate(a: DateParts, b: DateParts): boolean {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

/** Printed forms to search on the PDF for a stored/ISO date. */
export function dateSearchNeedles(raw: string): string[] {
  const parts = parseDateParts(raw);
  if (!parts) return [];
  const { y, m, d } = parts;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const variants = [
    `${y}-${mm}-${dd}`,
    `${dd}.${mm}.${y}`,
    `${d}.${m}.${y}`,
    `${dd}/${mm}/${y}`,
    `${d}/${m}/${y}`,
    `${dd}-${mm}-${y}`,
    `${d}-${m}-${y}`,
    `${y}.${mm}.${dd}`,
    `${y}/${mm}/${dd}`,
    `${dd}${mm}${y}`,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
