import { DocumentType } from '../../common/enums';
import {
  PO_CONFIRMATION_PROMPT_VERSION,
  PO_CONFIRMATION_SYSTEM_PROMPT,
  buildPoConfirmationUserPrompt,
} from './po-confirmation.v1';
import { EXTRACTION_SCHEMA_VERSION } from '../schemas/po-confirmation.schema';

export interface PromptBundle {
  documentType: string;
  promptVersion: string;
  schemaVersion: string;
  systemPrompt: string;
  userPrompt: string;
}

export function resolvePrompt(
  documentType: string,
  fileName: string,
): PromptBundle {
  switch (documentType) {
    case DocumentType.PURCHASE_ORDER_CONFIRMATION:
    default:
      return {
        documentType: DocumentType.PURCHASE_ORDER_CONFIRMATION,
        promptVersion: PO_CONFIRMATION_PROMPT_VERSION,
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
        systemPrompt: PO_CONFIRMATION_SYSTEM_PROMPT,
        userPrompt: buildPoConfirmationUserPrompt(fileName),
      };
  }
}
