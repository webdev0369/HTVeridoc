import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentType, FieldMode } from '../common/enums';
import { isConfigurableDocumentType } from '../fields/field-catalog';
import {
  Organization,
  OrganizationSettings,
} from './entities/organization.entity';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import {
  allowedColumnsForFeature,
  BUILTIN_LINE_ITEM_FEATURE_COLUMNS,
  BUILTIN_LINE_ITEM_FEATURE_LABELS,
  BUILTIN_LINE_ITEM_FEATURES,
  defaultLineItemDocumentConfig,
  hasNormalizeVolumeToLiters,
  isBuiltinLineItemFeature,
  isLineItemColumnKey,
  isValidCustomFeatureKey,
  LINE_ITEM_COLUMN_KEYS,
  LINE_ITEM_COLUMN_LABELS,
  type CustomLineItemFeature,
  type LineItemDocumentConfig,
  setNormalizeVolumeToLiters,
} from './line-item-config';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
  ) {}

  async findOne(id: string) {
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return this.toDto(org);
  }

  async getSettings(organizationId: string): Promise<OrganizationSettings> {
    const org = await this.orgsRepo.findOne({ where: { id: organizationId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return this.normalizeSettings(org.settings);
  }

  /** True when normalizeVolumeToLiters is enabled for this document type. */
  async preferLitersForVolumeBase(
    organizationId: string,
    documentType: string,
  ): Promise<boolean> {
    const settings = await this.getSettings(organizationId);
    return hasNormalizeVolumeToLiters(
      settings.lineItemConfigByDocumentType?.[documentType],
    );
  }

  async updateSettings(
    organizationId: string,
    dto: UpdateOrganizationSettingsDto,
  ) {
    const org = await this.orgsRepo.findOne({ where: { id: organizationId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    const next = this.normalizeSettings(org.settings);

    if (dto.customFeature) {
      next.customLineItemFeatures = this.upsertCustomFeature(
        next.customLineItemFeatures ?? [],
        dto.customFeature,
      );
    }

    if (
      dto.preferLitersForVolumeBase !== undefined ||
      dto.lineItemConfig !== undefined
    ) {
      if (!dto.documentType || !isConfigurableDocumentType(dto.documentType)) {
        throw new BadRequestException(
          'documentType is required and must be a supported type',
        );
      }

      const byType = next.lineItemConfigByDocumentType ?? {};
      let typeConfig =
        byType[dto.documentType] ?? defaultLineItemDocumentConfig();

      if (dto.lineItemConfig?.columns) {
        typeConfig = this.mergeLineItemConfig(
          typeConfig,
          dto.lineItemConfig.columns,
          next.customLineItemFeatures ?? [],
        );
      }

      if (dto.preferLitersForVolumeBase !== undefined) {
        typeConfig = setNormalizeVolumeToLiters(
          typeConfig,
          Boolean(dto.preferLitersForVolumeBase),
        );
      }

      next.lineItemConfigByDocumentType = {
        ...byType,
        [dto.documentType]: typeConfig,
      };
    }

    org.settings = next;
    await this.orgsRepo.save(org);
    return this.toDto(org);
  }

  getLineItemCatalog(customFeatures: CustomLineItemFeature[] = []) {
    const allColumnKeys = [...LINE_ITEM_COLUMN_KEYS];
    const builtin = BUILTIN_LINE_ITEM_FEATURES.map((key) => ({
      key,
      label: BUILTIN_LINE_ITEM_FEATURE_LABELS[key],
      columnKeys: [...BUILTIN_LINE_ITEM_FEATURE_COLUMNS[key]],
      builtin: true as const,
    }));
    const custom = customFeatures.map((f) => ({
      key: f.key,
      label: f.label,
      columnKeys: allColumnKeys,
      builtin: false as const,
    }));
    return {
      columns: LINE_ITEM_COLUMN_KEYS.map((key) => ({
        key,
        label: LINE_ITEM_COLUMN_LABELS[key],
      })),
      features: [...builtin, ...custom],
    };
  }

  private toDto(org: Organization) {
    const settings = this.normalizeSettings(org.settings);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      settings,
      lineItemCatalog: this.getLineItemCatalog(
        settings.customLineItemFeatures ?? [],
      ),
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }

  private upsertCustomFeature(
    existing: CustomLineItemFeature[],
    incoming: CustomLineItemFeature,
  ): CustomLineItemFeature[] {
    if (!isValidCustomFeatureKey(incoming.key)) {
      throw new BadRequestException(
        'Feature key must be camelCase starting with a lowercase letter',
      );
    }
    if (isBuiltinLineItemFeature(incoming.key)) {
      throw new BadRequestException(
        `Feature key "${incoming.key}" is reserved for a built-in feature`,
      );
    }
    const label = incoming.label.trim();
    if (label.length < 2) {
      throw new BadRequestException('Feature label is required');
    }
    const next = [...existing];
    const idx = next.findIndex((f) => f.key === incoming.key);
    if (idx >= 0) {
      next[idx] = { key: incoming.key, label };
    } else {
      next.push({ key: incoming.key, label });
    }
    return next;
  }

  private mergeLineItemConfig(
    base: LineItemDocumentConfig,
    incoming: Record<string, { mode?: FieldMode; features?: string[] }>,
    customFeatures: CustomLineItemFeature[],
  ): LineItemDocumentConfig {
    const customKeys = new Set(customFeatures.map((f) => f.key));
    const columns = { ...base.columns };
    for (const [key, patch] of Object.entries(incoming)) {
      if (!isLineItemColumnKey(key)) {
        throw new BadRequestException(`Unknown line column "${key}"`);
      }
      const existing = columns[key] ?? {
        mode: FieldMode.OPTIONAL,
        features: [] as string[],
      };
      let features = existing.features ?? [];
      if (patch.features) {
        for (const f of patch.features) {
          const allowed = allowedColumnsForFeature(f, customFeatures);
          if (allowed === 'all') {
            if (!customKeys.has(f) && !isBuiltinLineItemFeature(f)) {
              throw new BadRequestException(`Unknown feature "${f}"`);
            }
            continue;
          }
          if (Array.isArray(allowed) && allowed.length === 0) {
            throw new BadRequestException(`Unknown feature "${f}"`);
          }
          if (Array.isArray(allowed) && !allowed.includes(key)) {
            throw new BadRequestException(
              `Feature "${f}" is not allowed on column "${key}"`,
            );
          }
        }
        features = patch.features.filter(
          (f) =>
            isBuiltinLineItemFeature(f) ||
            customKeys.has(f) ||
            isValidCustomFeatureKey(f),
        );
      }
      columns[key] = {
        mode: patch.mode ?? existing.mode ?? FieldMode.OPTIONAL,
        features,
      };
    }
    return { columns };
  }

  private normalizeSettings(
    settings: OrganizationSettings | null | undefined,
  ): OrganizationSettings {
    const byType: Record<string, LineItemDocumentConfig> = {};
    const customFeatures = this.normalizeCustomFeatures(
      settings?.customLineItemFeatures,
    );

    for (const [docType, cfg] of Object.entries(
      settings?.lineItemConfigByDocumentType ?? {},
    )) {
      byType[docType] = this.coerceDocumentConfig(cfg, customFeatures);
    }

    for (const [docType, enabled] of Object.entries(
      settings?.preferLitersByDocumentType ?? {},
    )) {
      if (!enabled) continue;
      const existing = byType[docType] ?? defaultLineItemDocumentConfig();
      if (!hasNormalizeVolumeToLiters(existing)) {
        byType[docType] = setNormalizeVolumeToLiters(existing, true);
      } else if (!byType[docType]) {
        byType[docType] = existing;
      }
    }

    if (settings?.preferLitersForVolumeBase) {
      const key = DocumentType.PURCHASE_ORDER_CONFIRMATION;
      const existing = byType[key] ?? defaultLineItemDocumentConfig();
      if (!hasNormalizeVolumeToLiters(existing)) {
        byType[key] = setNormalizeVolumeToLiters(existing, true);
      } else if (!byType[key]) {
        byType[key] = existing;
      }
    }

    return {
      lineItemConfigByDocumentType: byType,
      customLineItemFeatures: customFeatures,
    };
  }

  private normalizeCustomFeatures(
    list: CustomLineItemFeature[] | undefined,
  ): CustomLineItemFeature[] {
    if (!list?.length) return [];
    const out: CustomLineItemFeature[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      if (!item?.key || !isValidCustomFeatureKey(item.key)) continue;
      if (isBuiltinLineItemFeature(item.key)) continue;
      if (seen.has(item.key)) continue;
      const label = item.label?.trim();
      if (!label) continue;
      seen.add(item.key);
      out.push({ key: item.key, label });
    }
    return out;
  }

  private coerceDocumentConfig(
    cfg: LineItemDocumentConfig | undefined,
    customFeatures: CustomLineItemFeature[],
  ): LineItemDocumentConfig {
    const customKeys = new Set(customFeatures.map((f) => f.key));
    const base = defaultLineItemDocumentConfig();
    if (!cfg?.columns) return base;
    for (const key of LINE_ITEM_COLUMN_KEYS) {
      const row = cfg.columns[key];
      if (!row) continue;
      const features = (row.features ?? []).filter(
        (f) => isBuiltinLineItemFeature(f) || customKeys.has(f),
      );
      base.columns[key] = {
        mode: row.mode ?? FieldMode.OPTIONAL,
        features,
      };
    }
    return base;
  }
}
