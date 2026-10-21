/** Common ISO 4217 codes for review — ordered for Nordic-first product usage. */
export const CURRENCY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'NOK', label: 'NOK — Norwegian krone' },
  { code: 'SEK', label: 'SEK — Swedish krona' },
  { code: 'DKK', label: 'DKK — Danish krone' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'USD', label: 'USD — US dollar' },
  { code: 'GBP', label: 'GBP — British pound' },
  { code: 'CHF', label: 'CHF — Swiss franc' },
  { code: 'ISK', label: 'ISK — Icelandic króna' },
  { code: 'PLN', label: 'PLN — Polish złoty' },
];

const NORDIC_HINT =
  /[æøåäö]|norge|norway|norsk|sverige|sweden|danmark|denmark|pakkseddel|leveringsadresse|faktura|ordrenr|vare|kr\b|\bnok\b|\bsek\b|\bdkk\b/i;

const EURO_HINT =
  /\beur\b|€|eurozone|deutschland|germany|france|nederland|netherlands|italia|españa|spain/i;

/**
 * Prefer currencies that match language / locale clues in extracted text.
 * Current value (if any) is always kept first when present.
 */
export function orderedCurrencyOptions(
  hints: Array<string | null | undefined>,
  current?: string | null,
): Array<{ code: string; label: string }> {
  const blob = hints.filter(Boolean).join(' ');
  let preferred: string[];
  if (NORDIC_HINT.test(blob)) {
    preferred = ['NOK', 'SEK', 'DKK', 'EUR', 'USD', 'GBP', 'CHF', 'ISK', 'PLN'];
  } else if (EURO_HINT.test(blob)) {
    preferred = ['EUR', 'NOK', 'SEK', 'DKK', 'USD', 'GBP', 'CHF', 'PLN', 'ISK'];
  } else {
    preferred = ['EUR', 'USD', 'GBP', 'NOK', 'SEK', 'DKK', 'CHF', 'PLN', 'ISK'];
  }

  const byCode = new Map(CURRENCY_OPTIONS.map((o) => [o.code, o]));
  const cur = current?.trim().toUpperCase() || null;
  const codes = [
    ...(cur && byCode.has(cur) ? [cur] : []),
    ...preferred.filter((c) => c !== cur),
  ];

  const options = codes
    .map((c) => byCode.get(c))
    .filter(Boolean) as Array<{ code: string; label: string }>;

  // Allow an uncommon current code not in the list.
  if (cur && !byCode.has(cur)) {
    options.unshift({ code: cur, label: cur });
  }
  return options;
}
