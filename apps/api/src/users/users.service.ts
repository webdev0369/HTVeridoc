import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationUser } from './entities/organization-user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(OrganizationUser)
    private readonly membershipsRepo: Repository<OrganizationUser>,
  ) {}

  async listByOrganization(organizationId: string) {
    const memberships = await this.membershipsRepo.find({
      where: { organizationId },
      relations: ['user', 'role'],
      order: { createdAt: 'ASC' },
    });

    return memberships.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      status: m.user.status,
      role: m.role.code,
      isPrimary: m.isPrimary,
      joinedAt: m.createdAt,
    }));
  }
}
