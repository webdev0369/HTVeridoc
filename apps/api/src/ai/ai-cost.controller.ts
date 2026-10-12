import { Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PermissionCode } from '../common/enums';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiCostController {
  constructor(private readonly aiService: AiService) {}

  @Get('requests')
  @RequirePermissions(PermissionCode.AUDIT_READ)
  list(
    @OrganizationId() organizationId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.aiService.listCosts(organizationId, limit);
  }
}
