import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { DocumentType, PermissionCode } from '../common/enums';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthUser } from '../auth/types/auth-user';
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
  ) {
    const type =
      (documentType as DocumentType) ||
      DocumentType.PURCHASE_ORDER_CONFIRMATION;
    return this.documentsService.upload(
      organizationId,
      user.userId,
      file,
      type,
    );
  }

  @Get()
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  list(
    @OrganizationId() organizationId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.documentsService.list(organizationId, page, limit);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  findOne(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentsService.findOne(organizationId, id);
  }

  @Get(':id/file')
  @RequirePermissions(PermissionCode.DOCUMENT_READ)
  async streamFile(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const file = await this.documentsService.getFileStream(organizationId, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.fileName)}"`,
    );
    res.setHeader('Content-Length', String(file.fileSize));
    file.stream.pipe(res);
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
