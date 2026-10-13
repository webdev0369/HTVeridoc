/** Normalize unit tokens for equality (KRT ≈ krt, "STK " ≈ STK). */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (unit == null) return null;
  const t = unit.trim().toUpperCase().replace(/\s+/g, '');
  return t || null;
}

function asNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  let s = value.trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function numStr(n: number | null): string | null {
  return n == null ? null : String(n);
}

/** Divisor to convert a volume unit into liters (1 unit = 1/divisor L). */
const VOLUME_TO_LITER: Record<string, number> = {
  ML: 1000,
  CL: 100,
  DL: 10,
};

export interface LineUnitFields {
  purchaseUnit: string | null;
  stocktakingUnit: string | null;
  purchaseQuantity: string | number | null;
  stockTakingQuantity: string | number | null;
  packageQuantity?: string | number | null;
  stockTakingQuantityPerPurchaseUnit: string | number | null;
  baseMeasurementUnit: string | null;
  /** Content of one stocktaking unit in baseMeasurementUnit terms */
  baseContentQuantity?: string | number | null;
  pricePerBaseUnit: string | number | null;
  stockTakingQuantityPerBaseMeasurementUnit: string | number | null;
  /** Free-text packaging, e.g. "KRT á 12 FL á 750 ML" */
  packaging?: string | null;
}

export interface DeriveLineUnitOptions {
  /** Convert ML/CL/DL base volumes to liters when content is known (or unit alone). */
  preferLitersForVolumeBase?: boolean;
}

export interface DerivedLineUnitFields {
  purchaseUnit: string | null;
  stocktakingUnit: string | null;
  purchaseQuantity: string | null;
  stockTakingQuantity: string | null;
  stockTakingQuantityPerPurchaseUnit: string | null;
  baseMeasurementUnit: string | null;
  baseContentQuantity: string | null;
  pricePerBaseUnit: string | null;
  stockTakingQuantityPerBaseMeasurementUnit: string | null;
}

export interface ParsedPackaging {
  purchaseUnit: string | null;
  stockTakingQuantityPerPurchaseUnit: number | null;
  stocktakingUnit: string | null;
  /** Content size of one stocktaking unit, e.g. 750 in "á 750 ML" */
  baseContentQuantity: number | null;
  baseMeasurementUnit: string | null;
}

/**
 * Parse Scandinavian wholesale packaging strings.
 *
 * Examples:
 * - "KRT á 12 FL á 750 ML" → purchase KRT, 12 FL / KRT, base ML (750 per FL)
 * - "PK á 10 STK" → purchase PK, 10 STK / PK
 * - "KRT a 12 FL a 750 ML" / "KRT x 12 FL" also accepted
 */
export function parseNorwegianPackaging(
  packaging: string | null | undefined,
): ParsedPackaging | null {
  if (!packaging?.trim()) return null;
  const text = packaging.trim();

  // Outer: PURCHASE á N STOCK [á M BASE]
  const nested =
    /^([A-Za-zæøåÆØÅ.]+)\s*[áaAx×*]\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zæøåÆØÅ.]+)(?:\s*[áaAx×*]\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zæøåÆØÅ.]+))?/u.exec(
      text,
    );
  if (nested) {
    return {
      purchaseUnit: normalizeUnit(nested[1]),
      stockTakingQuantityPerPurchaseUnit: asNumber(nested[2]),
      stocktakingUnit: normalizeUnit(nested[3]),
      baseContentQuantity: asNumber(nested[4]),
      baseMeasurementUnit: normalizeUnit(nested[5]),
    };
  }

  // Fallback: "á N UNIT" only
  const simple = /[áaAx×*]\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zæøåÆØÅ.]+)/u.exec(text);
  if (simple) {
    return {
      purchaseUnit: null,
      stockTakingQuantityPerPurchaseUnit: asNumber(simple[1]),
      stocktakingUnit: normalizeUnit(simple[2]),
      baseContentQuantity: null,
      baseMeasurementUnit: null,
    };
  }

  return null;
}

function looksLikePackaging(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /[áaAx×*]/.test(text) && /\d/.test(text);
}

/**
 * Derive conversion / base-unit fields from purchase & stocktaking units,
 * and from packaging text when header columns are incomplete.
 *
 * - Same purchase & stocktaking unit → stockTakingQuantityPerPurchaseUnit = 1
 * - Packaging "KRT á 12 FL á 750 ML" fills missing purchase/stocktaking/base/content
 * - stockTakingQuantity filled from purchaseQuantity × factor when missing
 * - preferLitersForVolumeBase: ML/CL/DL → L with content ÷ divisor
 */
export function deriveLineUnitFields(
  input: LineUnitFields,
  options: DeriveLineUnitOptions = {},
): DerivedLineUnitFields {
  const packagingSource =
    input.packaging ||
    (looksLikePackaging(input.purchaseUnit) ? input.purchaseUnit : null) ||
    (looksLikePackaging(input.stocktakingUnit) ? input.stocktakingUnit : null);
  const parsed = parseNorwegianPackaging(packagingSource);

  let purchaseUnit =
    input.purchaseUnit?.trim() || parsed?.purchaseUnit || null;
  let stocktakingUnit =
    input.stocktakingUnit?.trim() || parsed?.stocktakingUnit || null;
  let baseRaw =
    input.baseMeasurementUnit?.trim() || parsed?.baseMeasurementUnit || null;

  const purchase = normalizeUnit(purchaseUnit);
  const stocktaking = normalizeUnit(stocktakingUnit);
  let base = normalizeUnit(baseRaw);

  // Prefer canonical casing from normalized tokens when we filled from packaging.
  if (purchase && !input.purchaseUnit?.trim() && parsed?.purchaseUnit) {
    purchaseUnit = parsed.purchaseUnit;
  }
  if (stocktaking && !input.stocktakingUnit?.trim() && parsed?.stocktakingUnit) {
    stocktakingUnit = parsed.stocktakingUnit;
  }
  if (base && !input.baseMeasurementUnit?.trim() && parsed?.baseMeasurementUnit) {
    baseRaw = parsed.baseMeasurementUnit;
  }

  let conversion = asNumber(input.stockTakingQuantityPerPurchaseUnit);
  if (conversion == null && parsed?.stockTakingQuantityPerPurchaseUnit != null) {
    conversion = parsed.stockTakingQuantityPerPurchaseUnit;
  }

  if (purchase && stocktaking && purchase === stocktaking) {
    conversion = 1;
  } else if (conversion == null) {
    const pq = asNumber(input.purchaseQuantity);
    const sq = asNumber(input.stockTakingQuantity);
    if (pq != null && pq > 0 && sq != null) {
      conversion = sq / pq;
    } else {
      const pkg = asNumber(input.packageQuantity);
      if (pkg != null && pkg > 0) conversion = pkg;
    }
  }

  // Missing SU but PU present and 1:1 → same unit (e.g. PDF only shows Antall/stk).
  if (purchaseUnit && !stocktakingUnit?.trim()) {
    const pq = asNumber(input.purchaseQuantity);
    const sq = asNumber(input.stockTakingQuantity);
    const oneToOne =
      conversion === 1 ||
      conversion == null ||
      (pq != null && sq != null && Math.abs(sq - pq) < 1e-9);
    if (oneToOne) {
      stocktakingUnit = purchaseUnit;
      if (conversion == null || conversion === 1) {
        conversion = 1;
      }
    }
  }
  const stocktakingAfterFallback = normalizeUnit(stocktakingUnit);

  let purchaseQuantity = asNumber(input.purchaseQuantity);
  let stockTakingQuantity = asNumber(input.stockTakingQuantity);

  if (
    stockTakingQuantity == null &&
    purchaseQuantity != null &&
    conversion != null &&
    conversion > 0
  ) {
    stockTakingQuantity = purchaseQuantity * conversion;
  }

  let baseContent = asNumber(input.baseContentQuantity);
  if (baseContent == null && parsed?.baseContentQuantity != null) {
    baseContent = parsed.baseContentQuantity;
  }

  let pricePerBase = asNumber(input.pricePerBaseUnit);

  // Prefer liters: convert ML/CL/DL → L and scale content + price.
  if (options.preferLitersForVolumeBase) {
    const pkgBase = normalizeUnit(parsed?.baseMeasurementUnit);
    // Prefer packaging as source of truth when it still has a volume subunit.
    const fromUnit =
      pkgBase && VOLUME_TO_LITER[pkgBase]
        ? pkgBase
        : base && VOLUME_TO_LITER[base]
          ? base
          : null;
    if (fromUnit) {
      const divisor = VOLUME_TO_LITER[fromUnit];
      if (pkgBase === fromUnit && parsed?.baseContentQuantity != null) {
        baseContent = parsed.baseContentQuantity / divisor;
      } else if (baseContent != null && base === fromUnit) {
        baseContent = baseContent / divisor;
      }
      // Scale price only when the stored base unit was the volume subunit.
      if (pricePerBase != null && base === fromUnit) {
        pricePerBase = pricePerBase * divisor;
      }
      base = 'L';
      baseRaw = 'L';
    }
  }

  let stPerBase = asNumber(input.stockTakingQuantityPerBaseMeasurementUnit);
  // Only meaningful when both units exist and differ.
  // For "1 FL = 750 ML", content is on the stocktaking unit — do not invent ST/base factor.
  if (!base || !stocktakingAfterFallback || stocktakingAfterFallback === base) {
    stPerBase = null;
  }

  return {
    purchaseUnit,
    stocktakingUnit,
    purchaseQuantity: numStr(purchaseQuantity),
    stockTakingQuantity: numStr(stockTakingQuantity),
    stockTakingQuantityPerPurchaseUnit: numStr(conversion),
    baseMeasurementUnit: baseRaw,
    baseContentQuantity: numStr(baseContent),
    pricePerBaseUnit: numStr(pricePerBase),
    stockTakingQuantityPerBaseMeasurementUnit: numStr(stPerBase),
  };
}
