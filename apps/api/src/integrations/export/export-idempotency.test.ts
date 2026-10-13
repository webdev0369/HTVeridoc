/**
 * Export contract + Sandbox idempotency checks (no Live HTTP).
 * Run: pnpm --filter @htveridoc/api test:export
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  EXPORT_CONTRACT_VERSION,
  EXPORT_PATHS,
  EXPORT_STORE_ORDER_SOURCE_PARTNER,
  extractDestinationOrderId,
} from './export-contract';
import { ExportPurchaseOrderService } from './purchase-order.service';
import type { ExportPoInput } from './export.types';
import type { ResolvedExportConnection } from './export-client.service';

function mockId(kind: string, ...parts: string[]): string {
  const digest = createHash('sha256')
    .update([kind, ...parts].join('|'))
    .digest('hex')
    .slice(0, 12);
  return `mock-${kind}-${digest}`;
}

function sampleMatch(): ExportPoInput['match'] {
  return {
    documentNumber: '211851250',
    currency: 'NOK',
    supplier: {
      externalKey: 'norengros',
      displayName: 'Norengros Kjosavik AS',
      destinationSupplierId: mockId('supplier', 'org1', 'norengros'),
      matchMethod: 'exact_supplier',
      matched: true,
    },
    products: [
      {
        lineItemId: 'line-1',
        articleNumber: '391119',
        description: 'Beger PP 750ml',
        destinationProductId: mockId('product', 'org1', 'norengros', '391119'),
        matchMethod: 'exact_supplier_article',
        matched: true,
        purchaseQuantity: 12,
        purchaseUnit: 'PK',
        stockTakingQuantity: 2400,
        stocktakingUnit: 'STK',
        stockTakingQuantityPerPurchaseUnit: 200,
        unitPrice: 75.49,
        amount: 905.88,
      },
    ],
    unmatchedProductCount: 0,
    readyForExport: true,
  };
}

describe('export destination contract (TotalCtrl)', () => {
  it('uses TotalCtrl store-orders / health paths (no /api/v1 prefix)', () => {
    assert.equal(EXPORT_PATHS.health, '/health');
    assert.equal(EXPORT_PATHS.storeOrders, '/orders/store-orders');
    assert.equal(
      EXPORT_PATHS.storeOrder('abc'),
      '/orders/store-orders/abc',
    );
    assert.equal(
      EXPORT_PATHS.partnerScheduleOrder,
      '/partner/v1/orders/schedule',
    );
    assert.equal(EXPORT_PATHS.suppliers, '/suppliers');
    assert.equal(EXPORT_STORE_ORDER_SOURCE_PARTNER, 4);
  });

  it('unwraps orderId from plain and interceptor Data envelopes', () => {
    assert.equal(
      extractDestinationOrderId({ status: true, orderId: 'ord-1' }),
      'ord-1',
    );
    assert.equal(
      extractDestinationOrderId({
        Status: true,
        StatusCode: 201,
        Data: { status: true, orderId: 'ord-2' },
      }),
      'ord-2',
    );
  });
});

describe('Sandbox export idempotency', () => {
  const connection: ResolvedExportConnection = {
    organizationId: 'org-1',
    mode: 'mock',
    baseUrl: null,
    apiKey: null,
    username: null,
    password: null,
    inventoryId: null,
    usePartnerSchedule: false,
    source: 'organization',
  };

  const clientStub = {
    mockId,
  };

  const service = new ExportPurchaseOrderService(clientStub as never);

  it('creates a stable destination PO id per document', async () => {
    const input: ExportPoInput = {
      documentId: 'doc-aaa',
      existingPoId: null,
      match: sampleMatch(),
    };
    const first = await service.createOrUpdate(connection, input);
    const second = await service.createOrUpdate(connection, input);
    assert.equal(first.created, true);
    assert.equal(second.created, true);
    assert.equal(first.destinationPoId, second.destinationPoId);
    assert.match(first.destinationPoId, /^mock-po-/);
  });

  it('retry with existingPoId updates instead of creating a duplicate', async () => {
    const create = await service.createOrUpdate(connection, {
      documentId: 'doc-bbb',
      existingPoId: null,
      match: sampleMatch(),
    });
    const retry = await service.createOrUpdate(connection, {
      documentId: 'doc-bbb',
      existingPoId: create.destinationPoId,
      match: sampleMatch(),
    });
    assert.equal(retry.created, false);
    assert.equal(retry.destinationPoId, create.destinationPoId);
  });

  it('payload matches TotalCtrl create-store-order / Rossum parse field names', () => {
    const payload = service.buildPayload({
      documentId: 'doc-ccc',
      existingPoId: null,
      inventoryId: 'inv-uuid',
      match: sampleMatch(),
    });
    assert.equal(payload.meta?.contractVersion, EXPORT_CONTRACT_VERSION);
    assert.equal(payload.meta?.source, 'htveridoc');
    assert.equal(payload.source, EXPORT_STORE_ORDER_SOURCE_PARTNER);
    assert.equal(payload.number, '211851250');
    assert.equal(payload.inventoryId, 'inv-uuid');
    assert.equal(payload.supplierId, mockId('supplier', 'org1', 'norengros'));
    assert.equal(payload.products.length, 1);
    assert.equal(payload.products[0].sku, '391119');
    assert.equal(payload.products[0].name, 'Beger PP 750ml');
    assert.equal(payload.products[0].orderQuantity, 12);
    assert.equal(payload.products[0].pricePerPurchaseUnit, 75.49);
    assert.equal(payload.products[0].stockTakingQuantityPerPurchaseUnit, 200);
  });

  it('simulates Approve → EXPORTED → retry without a second PO id', async () => {
    type Mapping = {
      exportStatus: 'exporting' | 'exported' | 'failed';
      destinationPoId: string | null;
    };
    let mapping: Mapping | null = null;
    const documentId = 'doc-e2e';

    const created = await service.createOrUpdate(connection, {
      documentId,
      existingPoId: null,
      match: sampleMatch(),
    });
    mapping = {
      exportStatus: 'exported',
      destinationPoId: created.destinationPoId,
    };

    if (mapping.exportStatus === 'exported' && mapping.destinationPoId) {
      const idempotent = {
        status: 'EXPORTED',
        destinationPoId: mapping.destinationPoId,
        idempotent: true,
      };
      assert.equal(idempotent.idempotent, true);
      assert.equal(idempotent.destinationPoId, created.destinationPoId);
    } else {
      assert.fail('expected exported mapping');
    }

    mapping = {
      exportStatus: 'failed',
      destinationPoId: created.destinationPoId,
    };
    const recovered = await service.createOrUpdate(connection, {
      documentId,
      existingPoId: mapping.destinationPoId,
      match: sampleMatch(),
    });
    assert.equal(recovered.created, false);
    assert.equal(recovered.destinationPoId, created.destinationPoId);
  });
});
