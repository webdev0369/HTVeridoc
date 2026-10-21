/**
 * Run: pnpm --filter @htveridoc/domains exec node --require ts-node/register/transpile-only --test src/extraction/line-unit-derivation.test.ts
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveLineUnitFields,
  parseNorwegianPackaging,
} from './line-unit-derivation';

describe('parseNorwegianPackaging', () => {
  it('parses à 12 PK (grave accent from PDFs)', () => {
    const parsed = parseNorwegianPackaging('à 12 PK');
    assert.equal(parsed?.stockTakingQuantityPerPurchaseUnit, 12);
    assert.equal(parsed?.stocktakingUnit, 'PK');
    assert.equal(parsed?.purchaseUnit, null);
  });

  it('parses á 12 PK (acute)', () => {
    const parsed = parseNorwegianPackaging('á 12 PK');
    assert.equal(parsed?.stockTakingQuantityPerPurchaseUnit, 12);
    assert.equal(parsed?.stocktakingUnit, 'PK');
  });

  it('parses nested KRT á 12 FL á 750 ML', () => {
    const parsed = parseNorwegianPackaging('KRT á 12 FL á 750 ML');
    assert.equal(parsed?.purchaseUnit, 'KRT');
    assert.equal(parsed?.stockTakingQuantityPerPurchaseUnit, 12);
    assert.equal(parsed?.stocktakingUnit, 'FL');
    assert.equal(parsed?.baseContentQuantity, 750);
    assert.equal(parsed?.baseMeasurementUnit, 'ML');
  });
});

describe('deriveLineUnitFields — Kvt + simple Pakning', () => {
  it('maps Kvt=4 + à 12 PK → stock=12, conversion=3', () => {
    const derived = deriveLineUnitFields({
      purchaseUnit: null,
      stocktakingUnit: null,
      purchaseQuantity: 4,
      stockTakingQuantity: null,
      stockTakingQuantityPerPurchaseUnit: null,
      baseMeasurementUnit: null,
      pricePerBaseUnit: null,
      stockTakingQuantityPerBaseMeasurementUnit: null,
      packaging: 'à 12 PK',
    });

    assert.equal(derived.purchaseQuantity, '4');
    assert.equal(derived.stockTakingQuantity, '12');
    assert.equal(derived.stockTakingQuantityPerPurchaseUnit, '3');
    assert.equal(derived.stocktakingUnit, 'PK');
  });

  it('corrects model that treated 12 as conversion (stock=48, factor=12)', () => {
    const derived = deriveLineUnitFields({
      purchaseUnit: null,
      stocktakingUnit: null,
      purchaseQuantity: 4,
      stockTakingQuantity: 48,
      stockTakingQuantityPerPurchaseUnit: 12,
      baseMeasurementUnit: null,
      pricePerBaseUnit: null,
      stockTakingQuantityPerBaseMeasurementUnit: null,
      packaging: 'à 12 PK',
    });

    assert.equal(derived.stockTakingQuantity, '12');
    assert.equal(derived.stockTakingQuantityPerPurchaseUnit, '3');
  });

  it('maps Kvt=3 + à 12 PK → stock=12, conversion=4', () => {
    const derived = deriveLineUnitFields({
      purchaseUnit: null,
      stocktakingUnit: null,
      purchaseQuantity: 3,
      stockTakingQuantity: null,
      stockTakingQuantityPerPurchaseUnit: null,
      baseMeasurementUnit: null,
      pricePerBaseUnit: null,
      stockTakingQuantityPerBaseMeasurementUnit: null,
      packaging: 'à 12 PK',
    });

    assert.equal(derived.stockTakingQuantity, '12');
    assert.equal(derived.stockTakingQuantityPerPurchaseUnit, '4');
  });

  it('maps Kvt=2 + à 3 PK → stock=3, conversion=1.5', () => {
    const derived = deriveLineUnitFields({
      purchaseUnit: null,
      stocktakingUnit: null,
      purchaseQuantity: 2,
      stockTakingQuantity: null,
      stockTakingQuantityPerPurchaseUnit: null,
      baseMeasurementUnit: null,
      pricePerBaseUnit: null,
      stockTakingQuantityPerBaseMeasurementUnit: null,
      packaging: 'à 3 PK',
    });

    assert.equal(derived.stockTakingQuantity, '3');
    assert.equal(derived.stockTakingQuantityPerPurchaseUnit, '1.5');
  });
});

describe('deriveLineUnitFields — nested packaging', () => {
  it('keeps nested KRT á 12 FL as conversion factor', () => {
    const derived = deriveLineUnitFields({
      purchaseUnit: null,
      stocktakingUnit: null,
      purchaseQuantity: 4,
      stockTakingQuantity: null,
      stockTakingQuantityPerPurchaseUnit: null,
      baseMeasurementUnit: null,
      pricePerBaseUnit: null,
      stockTakingQuantityPerBaseMeasurementUnit: null,
      packaging: 'KRT á 12 FL',
    });

    assert.equal(derived.purchaseUnit, 'KRT');
    assert.equal(derived.stocktakingUnit, 'FL');
    assert.equal(derived.stockTakingQuantityPerPurchaseUnit, '12');
    assert.equal(derived.stockTakingQuantity, '48');
  });
});
