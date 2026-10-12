import { Injectable } from '@nestjs/common';
import {
  ResolvedExportConnection,
  ExportClientService,
} from './export-client.service';
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
   * Create or update a PO in the export destination.
   * If `existingPoId` is set, updates that record (idempotent retry).
   */
  async createOrUpdate(
    connection: ResolvedExportConnection,
    input: ExportPoInput,
  ): Promise<ExportPoResult> {
    const payload = {
      documentId: input.documentId,
      externalPoNumber: input.match.documentNumber,
      supplierId: input.match.supplier.destinationSupplierId,
      supplierName: input.match.supplier.displayName,
      lines: input.match.products
        .filter((p) => p.matched && p.destinationProductId)
        .map((p) => ({
          lineItemId: p.lineItemId,
          productId: p.destinationProductId,
          articleNumber: p.articleNumber,
          description: p.description,
        })),
    };

    if (connection.mode === 'mock') {
      const destinationPoId =
        input.existingPoId ??
        this.exportClient.mockId('po', connection.organizationId, input.documentId);
      return {
        destinationPoId,
        created: !input.existingPoId,
        payload: { ...payload, mode: 'mock' },
      };
    }

    if (input.existingPoId) {
      await this.exportClient.request(
        connection,
        'PUT',
        `/purchase-orders/${encodeURIComponent(input.existingPoId)}`,
        payload,
      );
      return {
        destinationPoId: input.existingPoId,
        created: false,
        payload: { ...payload, mode: 'live' },
      };
    }

    const created = await this.exportClient.request<{ id: string }>(
      connection,
      'POST',
      '/purchase-orders',
      payload,
    );
    if (!created?.id) {
      throw new Error('Export destination create PO response missing id');
    }
    return {
      destinationPoId: created.id,
      created: true,
      payload: { ...payload, mode: 'live' },
    };
  }
}
