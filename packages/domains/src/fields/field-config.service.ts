import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DocumentType, FieldMode } from '@htveridoc/shared';
import { UpdateFieldConfigDto } from './dto/update-field-config.dto';
import { OrganizationDocumentFieldConfig } from '@htveridoc/db/fields/entities/organization-document-field-config.entity';
import {
  CONFIGURABLE_DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  getCatalogFieldKeys,
  getCatalogFields,
  isConfigurableDocumentType,
} from './field-catalog';

export interface EffectiveFieldConfig {
  fieldKey: string;
  label: string;
  group: string;
  sortOrder: number;
  mode: FieldMode;
  defaultMode: FieldMode;
}

@Injectable()
export class FieldConfigService {
  constructor(
    @InjectRepository(OrganizationDocumentFieldConfig)
    private readonly configRepo: Repository<OrganizationDocumentFieldConfig>,
  ) {}

  /** Seed default rows for every configurable document type. */
  async seedDefaultsForOrganization(
    organizationId: string,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(OrganizationDocumentFieldConfig)
      : this.configRepo;

    const rows: OrganizationDocumentFieldConfig[] = [];
    for (const documentType of CONFIGURABLE_DOCUMENT_TYPES) {
      for (const field of getCatalogFields(documentType)) {
        rows.push(
          repo.create({
            organizationId,
            documentType,
            fieldKey: field.fieldKey,
            mode: field.defaultMode,
          }),
        );
      }
    }

    if (rows.length) {
      await repo.save(rows);
    }
  }

  async ensureSeeded(organizationId: string) {
    const count = await this.configRepo.count({ where: { organizationId } });
    if (count === 0) {
      await this.seedDefaultsForOrganization(organizationId);
    }
  }

  async getConfig(
    organizationId: string,
    documentType: DocumentType,
  ): Promise<{
    documentType: DocumentType;
    documentTypeLabel: string;
    fields: EffectiveFieldConfig[];
    requiresLineItems: boolean;
  }> {
    if (!isConfigurableDocumentType(documentType)) {
      throw new BadRequestException(`Unsupported document type: ${documentType}`);
    }

    await this.ensureSeeded(organizationId);

    const catalog = getCatalogFields(documentType);
    const overrides = await this.configRepo.find({
      where: { organizationId, documentType },
    });
    const modeByKey = new Map(
      overrides.map((row) => [row.fieldKey, row.mode]),
    );

    const fields: EffectiveFieldConfig[] = catalog.map((field) => ({
      fieldKey: field.fieldKey,
      label: field.label,
      group: field.group,
      sortOrder: field.sortOrder,
      defaultMode: field.defaultMode,
      mode: modeByKey.get(field.fieldKey) ?? field.defaultMode,
    }));

    return {
      documentType,
      documentTypeLabel: DOCUMENT_TYPE_LABELS[documentType],
      fields,
      requiresLineItems:
        documentType === DocumentType.PURCHASE_ORDER_CONFIRMATION,
    };
  }

  async listDocumentTypes(organizationId: string) {
    await this.ensureSeeded(organizationId);
    return CONFIGURABLE_DOCUMENT_TYPES.map((documentType) => ({
      documentType,
      label: DOCUMENT_TYPE_LABELS[documentType],
      extractionSupported:
        documentType === DocumentType.PURCHASE_ORDER_CONFIRMATION,
    }));
  }

  async replaceConfig(organizationId: string, dto: UpdateFieldConfigDto) {
    if (!isConfigurableDocumentType(dto.documentType)) {
      throw new BadRequestException(
        `Unsupported document type: ${dto.documentType}`,
      );
    }

    await this.ensureSeeded(organizationId);

    const allowed = getCatalogFieldKeys(dto.documentType);
    for (const item of dto.fields) {
      if (!allowed.has(item.fieldKey)) {
        throw new BadRequestException(
          `Unknown fieldKey "${item.fieldKey}" for ${dto.documentType}`,
        );
      }
    }

    const catalog = getCatalogFields(dto.documentType);
    const incoming = new Map(dto.fields.map((f) => [f.fieldKey, f.mode]));

    // Ensure every catalog field has a mode (default if omitted).
    const effective = catalog.map((field) => ({
      fieldKey: field.fieldKey,
      mode: incoming.get(field.fieldKey) ?? field.defaultMode,
    }));

    await this.configRepo.manager.transaction(async (manager) => {
      await manager.delete(OrganizationDocumentFieldConfig, {
        organizationId,
        documentType: dto.documentType,
      });

      await manager.save(
        effective.map((item) =>
          manager.create(OrganizationDocumentFieldConfig, {
            organizationId,
            documentType: dto.documentType,
            fieldKey: item.fieldKey,
            mode: item.mode,
          }),
        ),
      );
    });

    return this.getConfig(organizationId, dto.documentType);
  }

  async resetConfig(organizationId: string, documentType: DocumentType) {
    if (!isConfigurableDocumentType(documentType)) {
      throw new BadRequestException(`Unsupported document type: ${documentType}`);
    }

    await this.ensureSeeded(organizationId);

    const catalog = getCatalogFields(documentType);
    await this.configRepo.manager.transaction(async (manager) => {
      await manager.delete(OrganizationDocumentFieldConfig, {
        organizationId,
        documentType,
      });
      await manager.save(
        catalog.map((field) =>
          manager.create(OrganizationDocumentFieldConfig, {
            organizationId,
            documentType,
            fieldKey: field.fieldKey,
            mode: field.defaultMode,
          }),
        ),
      );
    });

    return this.getConfig(organizationId, documentType);
  }

  /** Modes keyed by fieldKey for validation / approve. */
  async getModeMap(
    organizationId: string,
    documentType: DocumentType,
  ): Promise<Map<string, FieldMode>> {
    if (!isConfigurableDocumentType(documentType)) {
      return new Map();
    }
    const config = await this.getConfig(organizationId, documentType);
    return new Map(config.fields.map((f) => [f.fieldKey, f.mode]));
  }

  async getRequiredFieldKeys(
    organizationId: string,
    documentType: DocumentType,
  ): Promise<string[]> {
    const modes = await this.getModeMap(organizationId, documentType);
    return [...modes.entries()]
      .filter(([, mode]) => mode === FieldMode.REQUIRED)
      .map(([key]) => key);
  }

  async getVisibleFieldKeys(
    organizationId: string,
    documentType: DocumentType,
  ): Promise<Set<string>> {
    const modes = await this.getModeMap(organizationId, documentType);
    return new Set(
      [...modes.entries()]
        .filter(([, mode]) => mode !== FieldMode.IGNORED)
        .map(([key]) => key),
    );
  }
}
