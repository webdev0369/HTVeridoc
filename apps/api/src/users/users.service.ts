import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { RoleCode, UserStatus } from '../common/enums';
import { CreateOrgUserDto } from './dto/create-org-user.dto';
import { UpdateOrgUserRoleDto } from './dto/update-org-user-role.dto';
import { UpdateOrgUserStatusDto } from './dto/update-org-user-status.dto';
import { OrganizationUser } from './entities/organization-user.entity';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';

export interface OrgUserDto {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  role: RoleCode;
  isPrimary: boolean;
  joinedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(OrganizationUser)
    private readonly membershipsRepo: Repository<OrganizationUser>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepo: Repository<RefreshToken>,
  ) {}

  async listByOrganization(organizationId: string): Promise<OrgUserDto[]> {
    const memberships = await this.membershipsRepo.find({
      where: { organizationId },
      relations: ['user', 'role'],
      order: { createdAt: 'ASC' },
    });

    return memberships.map((m) => this.toDto(m));
  }

  async listRoles() {
    const roles = await this.rolesRepo.find({ order: { code: 'ASC' } });
    return roles.map((r) => ({
      code: r.code as RoleCode,
      name: r.name,
    }));
  }

  async createInOrganization(
    organizationId: string,
    _actorUserId: string,
    dto: CreateOrgUserDto,
  ): Promise<OrgUserDto> {
    const email = dto.email.trim().toLowerCase();
    const role = await this.requireRole(dto.role);

    let user = await this.usersRepo.findOne({ where: { email } });
    if (user) {
      const existing = await this.membershipsRepo.findOne({
        where: { organizationId, userId: user.id },
      });
      if (existing) {
        throw new ConflictException(
          'User is already a member of this organization',
        );
      }
      // Existing global user: add membership; do not overwrite password/name.
    } else {
      if (!dto.password?.trim()) {
        throw new BadRequestException(
          'Password is required when creating a new user',
        );
      }
      const passwordHash = await bcrypt.hash(dto.password, 12);
      user = await this.usersRepo.save(
        this.usersRepo.create({
          email,
          name: dto.name.trim(),
          passwordHash,
          status: UserStatus.ACTIVE,
        }),
      );
    }

    const membership = await this.membershipsRepo.save(
      this.membershipsRepo.create({
        organizationId,
        userId: user.id,
        roleId: role.id,
        isPrimary: false,
      }),
    );

    const full = await this.membershipsRepo.findOneOrFail({
      where: { id: membership.id },
      relations: ['user', 'role'],
    });
    return this.toDto(full);
  }

  async updateRole(
    organizationId: string,
    actorUserId: string,
    targetUserId: string,
    dto: UpdateOrgUserRoleDto,
  ): Promise<OrgUserDto> {
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const membership = await this.requireMembership(organizationId, targetUserId);
    const nextRole = await this.requireRole(dto.role);

    if (
      membership.role.code === RoleCode.ADMIN &&
      nextRole.code !== RoleCode.ADMIN
    ) {
      await this.assertNotLastActiveAdmin(organizationId, targetUserId);
    }

    membership.roleId = nextRole.id;
    await this.membershipsRepo.save(membership);

    const full = await this.membershipsRepo.findOneOrFail({
      where: { id: membership.id },
      relations: ['user', 'role'],
    });
    return this.toDto(full);
  }

  async updateStatus(
    organizationId: string,
    actorUserId: string,
    targetUserId: string,
    dto: UpdateOrgUserStatusDto,
  ): Promise<OrgUserDto> {
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('You cannot change your own status');
    }

    const membership = await this.requireMembership(organizationId, targetUserId);
    const user = membership.user;

    if (
      dto.status === UserStatus.DISABLED &&
      membership.role.code === RoleCode.ADMIN
    ) {
      await this.assertNotLastActiveAdmin(organizationId, targetUserId);
    }

    user.status = dto.status;
    await this.usersRepo.save(user);

    if (dto.status === UserStatus.DISABLED) {
      await this.revokeRefreshTokens(user.id);
    }

    const full = await this.membershipsRepo.findOneOrFail({
      where: { id: membership.id },
      relations: ['user', 'role'],
    });
    return this.toDto(full);
  }

  private toDto(m: OrganizationUser): OrgUserDto {
    return {
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      status: m.user.status,
      role: m.role.code as RoleCode,
      isPrimary: m.isPrimary,
      joinedAt: m.createdAt,
    };
  }

  private async requireRole(code: RoleCode): Promise<Role> {
    const role = await this.rolesRepo.findOne({ where: { code } });
    if (!role) {
      throw new BadRequestException(`Unknown role: ${code}`);
    }
    return role;
  }

  private async requireMembership(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationUser> {
    const membership = await this.membershipsRepo.findOne({
      where: { organizationId, userId },
      relations: ['user', 'role'],
    });
    if (!membership) {
      throw new NotFoundException('User is not a member of this organization');
    }
    return membership;
  }

  private async assertNotLastActiveAdmin(
    organizationId: string,
    excludeUserId: string,
  ) {
    const admins = await this.membershipsRepo.find({
      where: { organizationId },
      relations: ['user', 'role'],
    });
    const otherActiveAdmins = admins.filter(
      (m) =>
        m.userId !== excludeUserId &&
        m.role.code === RoleCode.ADMIN &&
        m.user.status === UserStatus.ACTIVE,
    );
    if (otherActiveAdmins.length === 0) {
      throw new BadRequestException(
        'Cannot remove or disable the last active admin in this organization',
      );
    }
  }

  private async revokeRefreshTokens(userId: string) {
    await this.refreshTokensRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
