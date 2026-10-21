import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '@htveridoc/shared/common/decorators/current-user.decorator';
import { OrganizationId } from '@htveridoc/shared/common/decorators/organization-id.decorator';
import { RequirePermissions } from '@htveridoc/shared/common/decorators/permissions.decorator';
import { DocumentType, PermissionCode } from '@htveridoc/shared';
import { JwtAuthGuard } from '@htveridoc/shared/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@htveridoc/shared/auth/guards/permissions.guard';
import { AuthUser } from '@htveridoc/shared/auth/types/auth-user';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @RequirePermissions(PermissionCode.DOCUMENT_CREATE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  upload(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType?: string,
    @Body('queueId') queueId?: string,
  ) {
    const type =
      (documentType as DocumentType) ||
      DocumentType.PURCHASE_ORDER_CONFIRMATION;
    return this.documentsService.upload(
      organizationId,
      user.userId,
      file,
      type,
      queueId || null,
      user.permissions,
    );
  }

  @Get()
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  list(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('queueId') queueId?: string,
  ) {
    return this.documentsService.list(organizationId, page, limit, {
      queueId: queueId || undefined,
      actor: {
        userId: user.userId,
        permissions: user.permissions,
        documentId: user.documentId,
      },
    });
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  findOne(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentsService.findOne(organizationId, id, {
      userId: user.userId,
      permissions: user.permissions,
      documentId: user.documentId,
    });
  }

  @Get(':id/file')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  async streamFile(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const file = await this.documentsService.getFileStream(organizationId, id, {
      userId: user.userId,
      permissions: user.permissions,
      documentId: user.documentId,
    });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.fileName)}"`,
    );
    res.setHeader('Content-Length', String(file.fileSize));
    file.stream.pipe(res);
  }

  @Patch(':id/queue')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  assignQueue(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('queueId') queueId: string | null,
  ) {
    return this.documentsService.assignQueue(
      organizationId,
      id,
      queueId || null,
      { userId: user.userId, permissions: user.permissions },
    );
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.DOCUMENT_EDIT)
  remove(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentsService.softDelete(organizationId, id);
  }
}
