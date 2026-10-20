import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/enums';
import { BatchUpdateExtractionDto } from './dto/batch-update-extraction.dto';
import { BulkUpdateLineColumnDto } from './dto/bulk-update-line-column.dto';
import { CreateLineItemDto } from './dto/create-line-item.dto';
import { RejectDocumentDto } from './dto/reject-document.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { UpdateLineItemDto } from './dto/update-line-item.dto';
import { ReviewService } from './review.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post(':id/review/start')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  startReview(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewService.startReview(organizationId, id);
  }

  @Post(':id/approve')
  @RequirePermissions(PermissionCode.DOCUMENT_APPROVE)
  approve(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewService.approve(organizationId, id);
  }

  @Post(':id/reject')
  @RequirePermissions(PermissionCode.DOCUMENT_REJECT)
  reject(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectDocumentDto,
  ) {
    return this.reviewService.reject(organizationId, id, body.reason);
  }

  @Post(':id/reopen')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  reopen(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviewService.reopen(organizationId, id);
  }

  @Patch(':id/extraction/batch')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  batchUpdateExtraction(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BatchUpdateExtractionDto,
  ) {
    return this.reviewService.batchUpdateExtraction(organizationId, id, body);
  }

  @Patch(':id/extraction/fields/:fieldId')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  updateField(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() body: UpdateFieldDto,
  ) {
    return this.reviewService.updateField(organizationId, id, fieldId, body);
  }

  @Post(':id/extraction/line-items')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  createLineItem(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateLineItemDto,
  ) {
    return this.reviewService.createLineItem(organizationId, id, body);
  }

  @Patch(':id/extraction/line-items/bulk-column')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  bulkUpdateLineColumn(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BulkUpdateLineColumnDto,
  ) {
    return this.reviewService.bulkUpdateLineColumn(organizationId, id, body);
  }

  @Patch(':id/extraction/line-items/:lineItemId')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  updateLineItem(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineItemId', ParseUUIDPipe) lineItemId: string,
    @Body() body: UpdateLineItemDto,
  ) {
    return this.reviewService.updateLineItem(
      organizationId,
      id,
      lineItemId,
      body,
    );
  }

  @Delete(':id/extraction/line-items/:lineItemId')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  deleteLineItem(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineItemId', ParseUUIDPipe) lineItemId: string,
  ) {
    return this.reviewService.deleteLineItem(organizationId, id, lineItemId);
  }
}
