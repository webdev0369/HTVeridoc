/**
 * Parse numbers as printed on Nordic/EU docs: "501,72", "1 003,44", "20.0".
 */
export function parseLocaleNumber(
  raw: string | number | null | undefined,
): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  let s = raw.trim().replace(/\s/g, '');
  if (!s) return null;

  if (s.includes(',') && s.includes('.')) {
    // 1.003,44 → thousand dots, decimal comma
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
