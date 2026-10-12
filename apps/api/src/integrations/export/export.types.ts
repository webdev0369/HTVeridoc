import type { ProductMatchResult } from './product.service';
import type { SupplierMatchResult } from './supplier.service';

export interface DocumentMatchResult {
  documentNumber: string | null;
  supplier: SupplierMatchResult;
  products: ProductMatchResult[];
  unmatchedProductCount: number;
  readyForExport: boolean;
}

export interface ExportPoInput {
  documentId: string;
  existingPoId: string | null;
  match: DocumentMatchResult;
}
