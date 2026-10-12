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

export interface LineUnitFields {
  purchaseUnit: string | null;
  stocktakingUnit: string | null;
  purchaseQuantity: string | number | null;
  stockTakingQuantity: string | number | null;
  packageQuantity?: string | number | null;
  stockTakingQuantityPerPurchaseUnit: string | number | null;
  baseMeasurementUnit: string | null;
  pricePerBaseUnit: string | number | null;
  stockTakingQuantityPerBaseMeasurementUnit: string | number | null;
}

export interface DerivedLineUnitFields {
  stockTakingQuantityPerPurchaseUnit: string | null;
  baseMeasurementUnit: string | null;
  pricePerBaseUnit: string | null;
  stockTakingQuantityPerBaseMeasurementUnit: string | null;
}

/**
 * Derive conversion / base-unit fields from purchase & stocktaking units.
 *
 * - Same purchase & stocktaking unit → stockTakingQuantityPerPurchaseUnit = 1
 * - Else derive from qty ratio or package quantity when conversion missing
 * - baseMeasurementUnit: keep only when detected (never invent)
 * - pricePerBaseUnit: keep only when detected
 * - stockTakingQuantityPerBaseMeasurementUnit: only when stocktaking ≠ base
 */
export function deriveLineUnitFields(
  input: LineUnitFields,
): DerivedLineUnitFields {
  const purchase = normalizeUnit(input.purchaseUnit);
  const stocktaking = normalizeUnit(input.stocktakingUnit);
  const baseRaw = input.baseMeasurementUnit?.trim() || null;
  const base = normalizeUnit(baseRaw);

  let conversion = asNumber(input.stockTakingQuantityPerPurchaseUnit);

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

  const pricePerBase = asNumber(input.pricePerBaseUnit);

  let stPerBase = asNumber(input.stockTakingQuantityPerBaseMeasurementUnit);
  // Only meaningful when both units exist and differ.
  if (!base || !stocktaking || stocktaking === base) {
    stPerBase = null;
  }

  return {
    stockTakingQuantityPerPurchaseUnit: numStr(conversion),
    baseMeasurementUnit: baseRaw,
    pricePerBaseUnit: numStr(pricePerBase),
    stockTakingQuantityPerBaseMeasurementUnit: numStr(stPerBase),
  };
}
