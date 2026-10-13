import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ResolvedExportConnection,
  ExportClientService,
} from './export-client.service';
import {
  EXPORT_CONTRACT_VERSION,
  EXPORT_PATHS,
  EXPORT_STORE_ORDER_SOURCE_PARTNER,
  extractDestinationOrderId,
  type DestinationStoreOrderPayload,
} from './export-contract';
import type { ExportPoInput } from './export.types';

export interface ExportPoResult {
  destinationPoId: string;
  created: boolean;
  payload: Record<string, unknown>;
}

@Injectable()
export class ExportPurchaseOrderService {
  constructor(private readonly exportClient: ExportClientService) {}

  /**
   * Map HTVeriDoc match result → TotalCtrl CreateStoreOrderDto
   * (same field names as Rossum parse-order Data).
   */
  buildPayload(input: ExportPoInput): DestinationStoreOrderPayload {
    const supplierName = input.match.supplier.displayName?.trim() || null;
    const supplierId =
      input.match.supplier.destinationSupplierId?.trim() ||
      supplierName ||
      null;

    const products = input.match.products
      .filter((p) => p.matched)
      .map((p) => {
        const orderQuantity = p.purchaseQuantity ?? null;
        const pricePerPurchaseUnit = p.unitPrice ?? null;
        const perPu = p.stockTakingQuantityPerPurchaseUnit ?? null;
        const pricePerStockTakingUnit =
          pricePerPurchaseUnit != null && perPu != null && perPu > 0
            ? Number((pricePerPurchaseUnit / perPu).toFixed(6))
            : null;

        return {
          name: p.description,
          sku: p.articleNumber,
          orderQuantity,
          pricePerPurchaseUnit,
          pricePerStockTakingUnit,
          stockTakingQuantityPerPurchaseUnit: perPu,
          subtotal:
            p.amount != null
              ? String(p.amount)
              : orderQuantity != null && pricePerPurchaseUnit != null
                ? String(
                    Number((orderQuantity * pricePerPurchaseUnit).toFixed(2)),
                  )
                : null,
          taxRate: '0',
          vatRate: '',
        };
      });

    return {
      supplierId,
      supplier: {
        address: '',
        email: '',
        phone: '',
        website: '',
        bankAccountNumber: '',
        iban: '',
        swift: '',
      },
      number: input.match.documentNumber,
      requestDate: '',
      deliveryDate: '',
      inventoryId: input.inventoryId ?? null,
      receivedDate: '',
      subtotal: '00.00',
      total: products.reduce((sum, line) => {
        const n = Number(line.subtotal);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
      vatAmount: '00.00',
      vatRate: '00.00',
      currency: input.match.currency ?? null,
      source: EXPORT_STORE_ORDER_SOURCE_PARTNER,
      products,
      meta: {
        contractVersion: EXPORT_CONTRACT_VERSION,
        source: 'htveridoc',
        documentId: input.documentId,
      },
    };
  }

  /**
   * Create or update a store order in TotalCtrl.
   * If `existingPoId` is set, PUT update (idempotent retry) — bare POST always creates a new order.
   */
  async createOrUpdate(
    connection: ResolvedExportConnection,
    input: ExportPoInput,
  ): Promise<ExportPoResult> {
    const payload = this.buildPayload({
      ...input,
      inventoryId: input.inventoryId ?? connection.inventoryId,
    });

    if (connection.mode === 'mock') {
      const destinationPoId =
        input.existingPoId ??
        this.exportClient.mockId(
          'po',
          connection.organizationId,
          input.documentId,
        );
      return {
        destinationPoId,
        created: !input.existingPoId,
        payload: { ...payload, mode: 'mock' },
      };
    }

    if (!payload.inventoryId && !connection.usePartnerSchedule) {
      throw new BadRequestException(
        'Live export requires inventoryId on the export connection (TotalCtrl store-orders), or enable Partner schedule ingest.',
      );
    }

    if (input.existingPoId) {
      await this.exportClient.request(
        connection,
        'PUT',
        EXPORT_PATHS.storeOrder(input.existingPoId),
        payload,
      );
      return {
        destinationPoId: input.existingPoId,
        created: false,
        payload: { ...payload, mode: 'live' },
      };
    }

    const createPath = connection.usePartnerSchedule
      ? EXPORT_PATHS.partnerScheduleOrder
      : EXPORT_PATHS.storeOrders;

    const created = await this.exportClient.request<unknown>(
      connection,
      'POST',
      createPath,
      payload,
    );
    const orderId = extractDestinationOrderId(created);
    if (!orderId) {
      throw new Error(
        'Export destination create order response missing orderId',
      );
    }
    return {
      destinationPoId: orderId,
      created: true,
      payload: { ...payload, mode: 'live' },
    };
  }
}
