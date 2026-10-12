import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentType } from '../common/enums';
import { OrganizationFieldCorrection } from './entities/organization-field-correction.entity';

@Injectable()
export class FieldCorrectionService {
  constructor(
    @InjectRepository(OrganizationFieldCorrection)
    private readonly correctionsRepo: Repository<OrganizationFieldCorrection>,
  ) {}

  normalizeValue(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Remember a reviewer correction so the same AI value is auto-fixed next time.
   */
  async remember(input: {
    organizationId: string;
    documentType: DocumentType;
    fieldKey: string;
    fromValue: string | null | undefined;
    toValue: string | null | undefined;
  }) {
    const fromValue = this.normalizeValue(input.fromValue);
    const toValue = this.normalizeValue(input.toValue);
    if (!fromValue || fromValue === toValue) return null;

    let row = await this.correctionsRepo.findOne({
      where: {
        organizationId: input.organizationId,
        documentType: input.documentType,
        fieldKey: input.fieldKey,
        fromValue,
      },
    });

    if (row) {
      row.toValue = toValue;
      row.hitCount += 1;
      return this.correctionsRepo.save(row);
    }

    row = this.correctionsRepo.create({
      organizationId: input.organizationId,
      documentType: input.documentType,
      fieldKey: input.fieldKey,
      fromValue,
      toValue,
      hitCount: 1,
    });
    return this.correctionsRepo.save(row);
  }

  /** Map of `${fieldKey}::${fromValue}` → toValue for an org + document type. */
  async getCorrectionMap(
    organizationId: string,
    documentType: DocumentType,
  ): Promise<Map<string, string>> {
    const rows = await this.correctionsRepo.find({
      where: { organizationId, documentType },
    });
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(this.mapKey(row.fieldKey, row.fromValue), row.toValue);
    }
    return map;
  }

  lookup(
    map: Map<string, string>,
    fieldKey: string,
    aiValue: string | null | undefined,
  ): string | null {
    const from = this.normalizeValue(aiValue);
    if (!from) return null;
    return map.get(this.mapKey(fieldKey, from)) ?? null;
  }

  private mapKey(fieldKey: string, fromValue: string) {
    return `${fieldKey}::${fromValue}`;
  }
}