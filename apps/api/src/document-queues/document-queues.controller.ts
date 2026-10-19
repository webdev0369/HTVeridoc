import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AuthUser } from '../auth/types/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/enums';
import { CreateDocumentQueueDto } from './dto/create-document-queue.dto';
import { UpdateDocumentQueueDto } from './dto/update-document-queue.dto';
import { DocumentQueuesService } from './document-queues.service';

@Controller('document-queues')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentQueuesController {
  constructor(private readonly queues: DocumentQueuesService) {}

  @Get()
  @RequirePermissions(PermissionCode.QUEUE_READ)
  list(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Query('includeInactive', new DefaultValuePipe(false), ParseBoolPipe)
    includeInactive: boolean,
  ) {
    return this.queues.list(
      organizationId,
      {
        userId: user.userId,
        role: user.role,
        permissions: user.permissions,
      },
      { includeInactive },
    );
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.QUEUE_READ)
  getOne(
    @OrganizationId() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.queues.getOne(organizationId, id, {
      userId: user.userId,
      permissions: user.permissions,
    });
  }

  @Post()
  @RequirePermissions(PermissionCode.QUEUE_MANAGE)
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateDocumentQueueDto,
  ) {
    return this.queues.create(organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.QUEUE_MANAGE)
  update(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentQueueDto,
  ) {
    return this.queues.update(organizationId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.QUEUE_MANAGE)
  archive(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.queues.archive(organizationId, id);
  }
}
