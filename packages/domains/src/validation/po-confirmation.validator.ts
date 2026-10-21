import { ExtractionField } from '@htveridoc/db/extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '@htveridoc/db/extraction/entities/extraction-line-item.entity';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  fieldKey?: string | null;
  lineItemId?: string | null;
  meta?: Record<string, unknown>;
}

const AMOUNT_TOLERANCE = 0.05;
const LOW_CONFIDENCE = 0.8;
const REVIEW_CONFIDENCE = 0.95;

function fieldMap(fields: ExtractionField[]) {
  return new Map(fields.map((f) => [f.fieldKey, f]));
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(value.trim());
  if (iso) {
    const d = new Date(iso[0]);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value.trim());
  if (dmy) {
    const d = new Date(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function num(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  let s = String(value).trim().replace(/\s/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function validatePoConfirmation(input: {
  fields: ExtractionField[];
  lineItems: ExtractionLineItem[];
  /** Org-configured required field keys (replaces hardcoded list). */
  requiredFieldKeys?: string[];
  /** Ignored fields: skip REQUIRED and field-level warnings. */
  ignoredFieldKeys?: Set<string> | string[];
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fields = fieldMap(input.fields);
  const lines = [...input.lineItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const ignored = new Set(
    input.ignoredFieldKeys ?? ['buyer.name', 'receiver.name'],
  );
  const requiredKeys =
    input.requiredFieldKeys ??
    (['documentNumber', 'supplier.name', 'currency'] as string[]);

  for (const key of requiredKeys) {
    if (ignored.has(key)) continue;
    const f = fields.get(key);
    if (!f?.currentValue?.trim()) {
      issues.push({
        severity: 'error',
        code: 'REQUIRED_FIELD',
        message: `Required field missing: ${f?.fieldLabel ?? key}`,
        fieldKey: key,
      });
    }
  }

  if (!lines.length) {
    issues.push({
      severity: 'error',
      code: 'REQUIRED_LINE_ITEMS',
      message: 'At least one line item is required',
    });
  }

  const currency = fields.get('currency')?.currentValue?.trim();
  if (currency && !ignored.has('currency') && !/^[A-Za-z]{3}$/.test(currency)) {
    issues.push({
      severity: 'warning',
      code: 'CURRENCY_FORMAT',
      message: `Currency "${currency}" is not a 3-letter code`,
      fieldKey: 'currency',
    });
  }

  const documentDate = parseDate(fields.get('documentDate')?.currentValue);
  const orderDate = parseDate(fields.get('orderDate')?.currentValue);

  if (
    !ignored.has('documentDate') &&
    fields.get('documentDate')?.currentValue &&
    !documentDate
  ) {
    issues.push({
      severity: 'error',
      code: 'INVALID_DATE',
      message: `Document date is invalid: ${fields.get('documentDate')?.currentValue}`,
      fieldKey: 'documentDate',
    });
  }
  if (
    !ignored.has('orderDate') &&
    fields.get('orderDate')?.currentValue &&
    !orderDate
  ) {
    issues.push({
      severity: 'error',
      code: 'INVALID_DATE',
      message: `Order date is invalid: ${fields.get('orderDate')?.currentValue}`,
      fieldKey: 'orderDate',
    });
  }
  if (
    !ignored.has('documentDate') &&
    documentDate &&
    orderDate &&
    documentDate < orderDate
  ) {
    issues.push({
      severity: 'warning',
      code: 'DATE_ORDER',
      message: 'Document date is earlier than order date',
      fieldKey: 'documentDate',
      meta: {
        documentDate: fields.get('documentDate')?.currentValue,
        orderDate: fields.get('orderDate')?.currentValue,
      },
    });
  }

  for (const field of input.fields) {
    if (ignored.has(field.fieldKey)) continue;
    if (field.confidence == null) continue;
    const c = Number(field.confidence);
    if (c < LOW_CONFIDENCE) {
      issues.push({
        severity: 'warning',
        code: 'LOW_CONFIDENCE',
        message: `Low confidence (${Math.round(c * 100)}%) on ${field.fieldLabel}`,
        fieldKey: field.fieldKey,
        meta: { confidence: c },
      });
    } else if (c < REVIEW_CONFIDENCE) {
      issues.push({
        severity: 'warning',
        code: 'REVIEW_RECOMMENDED',
        message: `Review recommended (${Math.round(c * 100)}%) for ${field.fieldLabel}`,
        fieldKey: field.fieldKey,
        meta: { confidence: c },
      });
    }
  }

  for (const line of lines) {
    const label = `Line ${line.position ?? line.sortOrder + 1}`;
    // Prefer purchaseQuantity (UI column); fall back to legacy quantity.
    const quantity =
      num(line.purchaseQuantity) ?? num(line.quantity);
    const unitPrice = num(line.unitPrice);
    const discount = num(line.discount);
    const vat = num(line.vat);
    const amount = num(line.amount);
    const isProduct = line.lineType === 'PRODUCT' || line.lineType === 'UNKNOWN';
    const isCancelled = line.lineType === 'CANCELLED';

    if (isProduct && !isCancelled) {
      if (quantity == null) {
        issues.push({
          severity: 'error',
          code: 'LINE_QUANTITY_REQUIRED',
          message: `${label}: quantity is required`,
          lineItemId: line.id,
        });
      } else if (quantity <= 0) {
        issues.push({
          severity: 'error',
          code: 'LINE_QUANTITY_POSITIVE',
          message: `${label}: quantity must be > 0`,
          lineItemId: line.id,
          meta: { quantity },
        });
      }

      if (unitPrice == null) {
        issues.push({
          severity: 'warning',
          code: 'LINE_UNIT_PRICE_MISSING',
          message: `${label}: unit price is missing`,
          lineItemId: line.id,
        });
      }
    }

    if (unitPrice != null && unitPrice < 0) {
      issues.push({
        severity: 'error',
        code: 'LINE_UNIT_PRICE_NEGATIVE',
        message: `${label}: unit price must be >= 0`,
        lineItemId: line.id,
        meta: { unitPrice },
      });
    }

    if (discount != null) {
      if (discount < 0) {
        issues.push({
          severity: 'error',
          code: 'LINE_DISCOUNT_NEGATIVE',
          message: `${label}: discount must be >= 0`,
          lineItemId: line.id,
          meta: { discount },
        });
      } else if (discount > 100) {
        issues.push({
          severity: 'warning',
          code: 'LINE_DISCOUNT_HIGH',
          message: `${label}: discount ${discount} looks above 100% — verify if absolute amount`,
          lineItemId: line.id,
          meta: { discount },
        });
      }
    }

    if (vat != null) {
      if (vat < 0) {
        issues.push({
          severity: 'error',
          code: 'LINE_VAT_NEGATIVE',
          message: `${label}: VAT must be >= 0`,
          lineItemId: line.id,
          meta: { vat },
        });
      } else if (vat > 100) {
        issues.push({
          severity: 'warning',
          code: 'LINE_VAT_HIGH',
          message: `${label}: VAT ${vat} looks above 100% — verify if absolute amount`,
          lineItemId: line.id,
          meta: { vat },
        });
      }
    }

    if (amount != null && amount < 0 && !isCancelled) {
      issues.push({
        severity: 'error',
        code: 'LINE_AMOUNT_NEGATIVE',
        message: `${label}: amount must be >= 0`,
        lineItemId: line.id,
        meta: { amount },
      });
    }

    if (
      quantity != null &&
      unitPrice != null &&
      amount != null &&
      !isCancelled &&
      line.lineType !== 'NOTE'
    ) {
      // Net = qty × price (− discount% when present).
      let net = quantity * unitPrice;
      const discountApplied =
        discount != null && discount >= 0 && discount <= 100;
      if (discountApplied) {
        net = net * (1 - discount! / 100);
      }

      // Candidates the printed total may match:
      // - no VAT / ex-VAT total → net
      // - VAT as absolute mva (e.g. 414) → net + vat
      // - VAT as percent (e.g. 15) → net × (1 + vat/100)
      const candidates: { expected: number; via: string }[] = [
        { expected: net, via: 'qty×price' },
      ];
      if (vat != null && vat >= 0) {
        candidates.push({
          expected: net + vat,
          via: 'qty×price+VAT',
        });
        if (vat <= 100) {
          candidates.push({
            expected: net * (1 + vat / 100),
            via: 'qty×price×(1+VAT%)',
          });
        }
      }

      let best = candidates[0];
      let bestDelta = Math.abs(best.expected - amount);
      for (let i = 1; i < candidates.length; i++) {
        const d = Math.abs(candidates[i].expected - amount);
        if (d < bestDelta) {
          best = candidates[i];
          bestDelta = d;
        }
      }

      if (bestDelta > AMOUNT_TOLERANCE) {
        const discountNote = discountApplied ? ' (−discount%)' : '';
        const vatNote =
          vat != null && vat >= 0
            ? ' (tried with/without VAT)'
            : '';
        issues.push({
          severity: 'error',
          code: 'LINE_AMOUNT_MISMATCH',
          message: `${label}: amount ${amount} does not match ${best.via}${discountNote}${vatNote} ≈ ${best.expected.toFixed(2)}`,
          lineItemId: line.id,
          meta: {
            quantity,
            unitPrice,
            discount,
            vat,
            amount,
            expected: best.expected,
            via: best.via,
            delta: bestDelta,
            candidates: candidates.map((c) => c.expected),
          },
        });
      }
    }

    if (line.confidence != null) {
      const c = Number(line.confidence);
      if (c < LOW_CONFIDENCE) {
        issues.push({
          severity: 'warning',
          code: 'LINE_LOW_CONFIDENCE',
          message: `${label}: low confidence (${Math.round(c * 100)}%)`,
          lineItemId: line.id,
          meta: { confidence: c },
        });
      }
    }
  }

  return issues;
}
