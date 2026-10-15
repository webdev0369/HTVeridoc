import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/enums';
import {
  QueueAdminService,
  QueueName,
} from './queue-admin.service';

@Controller('queue')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QueueAdminController {
  constructor(private readonly queueAdmin: QueueAdminService) {}

  @Get('jobs')
  @RequirePermissions(PermissionCode.QUEUE_READ)
  listJobs(
    @OrganizationId() organizationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('failedOnly', new DefaultValuePipe(false), ParseBoolPipe)
    failedOnly: boolean,
  ) {
    return this.queueAdmin.listJobs(organizationId, { limit, failedOnly });
  }

  @Post('jobs/:queueName/:jobId/retry')
  @RequirePermissions(PermissionCode.QUEUE_MANAGE)
  retryJob(
    @OrganizationId() organizationId: string,
    @Param('queueName') queueName: QueueName,
    @Param('jobId') jobId: string,
  ) {
    return this.queueAdmin.retryJob(organizationId, queueName, jobId);
  }
}
