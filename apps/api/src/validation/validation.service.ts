import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DocumentStatus, FieldMode } from '../common/enums';
import { Document } from '../documents/entities/document.entity';
import { Extraction } from '../extraction/entities/extraction.entity';
import { FieldConfigService } from '../fields/field-config.service';
import { HandoffDispatchService } from '../integrations/handoff/handoff-dispatch.service';
import { ProcessingLogService } from '../processing/processing-log.service';
import { DocumentValidationError } from './entities/document-validation-error.entity';
import { ValidationResult } from './entities/validation-result.entity';
import { validatePoConfirmation } from './po-confirmation.validator';

@Injectable()
export class ValidationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ValidationResult)
    private readonly resultsRepo: Repository<ValidationResult>,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    @InjectRepository(Extraction)
    private readonly extractionsRepo: Repository<Extraction>,
    private readonly processingLog: ProcessingLogService,
    private readonly fieldConfigService: FieldConfigService,
    private readonly handoff: HandoffDispatchService,
  ) {}

  async validateDocument(documentId: string, organizationId: string) {
    const document = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.organizationId !== organizationId) {
      throw new ForbiddenException('Document belongs to another organization');
    }

    const extraction = await this.extractionsRepo.findOne({
      where: { documentId },
      relations: ['fields', 'lineItems'],
    });
    if (!extraction || extraction.status !== 'completed') {
      throw new NotFoundException('Completed extraction not found');
    }

    // Re-validate during active review must NOT bounce status through
    // VALIDATING → READY_FOR_REVIEW (slow + webhooks + wipes In review).
    const preserveStatus =
      document.status === DocumentStatus.IN_REVIEW ||
      document.status === DocumentStatus.APPROVED ||
      document.status === DocumentStatus.REJECTED ||
      document.status === DocumentStatus.EXPORTING ||
      document.status === DocumentStatus.EXPORTED ||
      document.status === DocumentStatus.EXPORT_FAILED;

    await this.processingLog.log(
      documentId,
      organizationId,
      'VALIDATION_START',
      preserveStatus
        ? 'Re-validating without status change…'
        : 'Running deterministic validation…',
    );

    if (!preserveStatus) {
      document.status = DocumentStatus.VALIDATING;
      await this.documentsRepo.save(document);
      this.handoff.notifyStatus(
        organizationId,
        documentId,
        DocumentStatus.VALIDATING,
      );
    }

    const modeMap = await this.fieldConfigService.getModeMap(
      organizationId,
      document.documentType,
    );
    const requiredFieldKeys = [...modeMap.entries()]
      .filter(([, mode]) => mode === FieldMode.REQUIRED)
      .map(([key]) => key);
    const ignoredFieldKeys = new Set(
      [...modeMap.entries()]
        .filter(([, mode]) => mode === FieldMode.IGNORED)
        .map(([key]) => key),
    );

    const issues = validatePoConfirmation({
      fields: extraction.fields ?? [],
      lineItems: extraction.lineItems ?? [],
      requiredFieldKeys,
      ignoredFieldKeys,
    });

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const status =
      errorCount > 0
        ? 'failed'
        : warningCount > 0
          ? 'passed_with_warnings'
          : 'passed';

    // Upsert one row per document — concurrent re-validates must not
    // race on delete+insert (validation_results_document_id_key).
    const result = await this.dataSource.transaction(async (manager) => {
      // Serialize concurrent validates for the same document.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext($1::text))`,
        [documentId],
      );

      let saved = await manager.findOne(ValidationResult, {
        where: { documentId },
      });

      if (saved) {
        await manager.delete(DocumentValidationError, {
          validationResultId: saved.id,
        });
        saved.organizationId = organizationId;
        saved.extractionId = extraction.id;
        saved.status = status;
        saved.errorCount = errorCount;
        saved.warningCount = warningCount;
        saved = await manager.save(saved);
      } else {
        saved = await manager.save(
          manager.create(ValidationResult, {
            documentId,
            organizationId,
            extractionId: extraction.id,
            status,
            errorCount,
            warningCount,
          }),
        );
      }

      if (issues.length) {
        await manager.save(
          issues.map((issue) =>
            manager.create(DocumentValidationError, {
              validationResultId: saved.id,
              severity: issue.severity,
              code: issue.code,
              message: issue.message,
              fieldKey: issue.fieldKey ?? null,
              lineItemId: issue.lineItemId ?? null,
              meta: issue.meta ?? null,
            }),
          ),
        );
      }

      return saved;
    });

    // First-time validation → ready for review. During review, keep status.
    if (!preserveStatus) {
      document.status = DocumentStatus.READY_FOR_REVIEW;
      await this.documentsRepo.save(document);
      this.handoff.notifyStatus(
        organizationId,
        documentId,
        DocumentStatus.READY_FOR_REVIEW,
      );
    }

    await this.processingLog.log(
      documentId,
      organizationId,
      'VALIDATION_DONE',
      `Validation ${status}: ${errorCount} error(s), ${warningCount} warning(s)`,
      {
        level: errorCount > 0 ? 'warn' : 'success',
        meta: { status, errorCount, warningCount, preserveStatus },
      },
    );

    return this.getByDocument(organizationId, documentId);
  }

  async getByDocument(organizationId: string, documentId: string) {
    const document = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.organizationId !== organizationId) {
      throw new ForbiddenException('Document belongs to another organization');
    }

    const result = await this.resultsRepo.findOne({
      where: { documentId },
      relations: ['errors'],
    });
    if (!result) {
      throw new NotFoundException('Validation result not found');
    }

    const errors = [...(result.errors ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    // Approved / rejected decisions supersede open confirmation blockers.
    const decided =
      document.status === DocumentStatus.APPROVED ||
      document.status === DocumentStatus.REJECTED;
    const visibleErrors = decided
      ? errors.filter((e) => e.severity !== 'error')
      : errors;
    const errorCount = decided
      ? 0
      : visibleErrors.filter((e) => e.severity === 'error').length;
    const warningCount = visibleErrors.filter(
      (e) => e.severity === 'warning',
    ).length;

    return {
      id: result.id,
      documentId: result.documentId,
      organizationId: result.organizationId,
      extractionId: result.extractionId,
      status: decided
        ? warningCount > 0
          ? 'passed_with_warnings'
          : 'passed'
        : result.status,
      errorCount,
      warningCount,
      errors: visibleErrors.map((e) => ({
        id: e.id,
        severity: e.severity,
        code: e.code,
        message: e.message,
        fieldKey: e.fieldKey,
        lineItemId: e.lineItemId,
        meta: e.meta,
        createdAt: e.createdAt,
      })),
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * Live check used before approve — does not change document status.
   * Returns error-severity messages if confirmation blockers remain.
   */
  async collectBlockingErrors(organizationId: string, documentId: string) {
    const document = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.organizationId !== organizationId) {
      throw new ForbiddenException('Document belongs to another organization');
    }

    const extraction = await this.extractionsRepo.findOne({
      where: { documentId },
      relations: ['fields', 'lineItems'],
    });
    if (!extraction || extraction.status !== 'completed') {
      throw new NotFoundException('Completed extraction not found');
    }

    const modeMap = await this.fieldConfigService.getModeMap(
      organizationId,
      document.documentType,
    );
    const requiredFieldKeys = [...modeMap.entries()]
      .filter(([, mode]) => mode === FieldMode.REQUIRED)
      .map(([key]) => key);
    const ignoredFieldKeys = new Set(
      [...modeMap.entries()]
        .filter(([, mode]) => mode === FieldMode.IGNORED)
        .map(([key]) => key),
    );

    const issues = validatePoConfirmation({
      fields: extraction.fields ?? [],
      lineItems: extraction.lineItems ?? [],
      requiredFieldKeys,
      ignoredFieldKeys,
    });

    return issues
      .filter((i) => i.severity === 'error')
      .map((i) => i.message);
  }

  /** Persist a clean validation snapshot after a successful approve. */
  async clearErrorsAfterApprove(organizationId: string, documentId: string) {
    const result = await this.resultsRepo.findOne({
      where: { documentId, organizationId },
    });
    if (!result) return;

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(DocumentValidationError, {
        validationResultId: result.id,
      });
      result.status = 'passed';
      result.errorCount = 0;
      result.warningCount = 0;
      await manager.save(result);
    });
  }
}
