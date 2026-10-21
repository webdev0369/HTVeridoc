import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '@htveridoc/db/organizations/entities/organization.entity';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Organization])],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsCoreModule {}

@Module({
  imports: [OrganizationsCoreModule],
  controllers: [OrganizationsController],
  exports: [OrganizationsCoreModule],
})
export class OrganizationsModule {}
