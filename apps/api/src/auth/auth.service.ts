import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PermissionCode, RoleCode, UserStatus } from '../common/enums';
import { FieldConfigService } from '../fields/field-config.service';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationUser } from '../users/entities/organization-user.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthUser } from './types/auth-user';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly fieldConfigService: FieldConfigService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgsRepo: Repository<Organization>,
    @InjectRepository(OrganizationUser)
    private readonly membershipsRepo: Repository<OrganizationUser>,
    @InjectRepository(Role) private readonly rolesRepo: Repository<Role>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepo: Repository<RefreshToken>,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.usersRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const existingOrg = await this.orgsRepo.findOne({
      where: { slug: dto.organizationSlug.toLowerCase() },
    });
    if (existingOrg) {
      throw new ConflictException('Organization slug already taken');
    }

    const adminRole = await this.rolesRepo.findOne({
      where: { code: RoleCode.ADMIN },
      relations: ['permissions'],
    });
    if (!adminRole) {
      throw new ConflictException('Roles not seeded. Run pnpm seed first.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.dataSource.transaction(async (manager) => {
      const organization = manager.create(Organization, {
        name: dto.organizationName,
        slug: dto.organizationSlug.toLowerCase(),
      });
      await manager.save(organization);

      const user = manager.create(User, {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
        status: UserStatus.ACTIVE,
      });
      await manager.save(user);

      const membership = manager.create(OrganizationUser, {
        organizationId: organization.id,
        userId: user.id,
        roleId: adminRole.id,
        isPrimary: true,
      });
      await manager.save(membership);

      await this.fieldConfigService.seedDefaultsForOrganization(
        organization.id,
        manager,
      );

      return { user, organization, role: adminRole };
    });

    const authUser = this.toAuthUser(
      result.user,
      result.organization.id,
      result.role,
    );
    return this.issueTokens(authUser);
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    // Same message for unknown email / wrong password — avoid account enumeration.
    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password. Check your details and try again.',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'This account is disabled. Contact your organization administrator.',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(
        'Invalid email or password. Check your details and try again.',
      );
    }

    const memberships = await this.membershipsRepo.find({
      where: { userId: user.id },
      relations: ['role', 'role.permissions', 'organization'],
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });

    if (!memberships.length) {
      throw new UnauthorizedException(
        'Your account is not linked to an organization. Ask an admin to invite you, or create a new organization.',
      );
    }

    let membership = memberships[0];
    if (dto.organizationId) {
      const selected = memberships.find(
        (m) => m.organizationId === dto.organizationId,
      );
      if (!selected) {
        throw new UnauthorizedException(
          'You are not a member of that organization. Sign in without selecting it, or ask an admin for access.',
        );
      }
      membership = selected;
    }

    const authUser = this.toAuthUser(
      user,
      membership.organizationId,
      membership.role,
    );
    const tokens = await this.issueTokens(authUser);

    return {
      ...tokens,
      organizations: memberships.map((m) => ({
        id: m.organizationId,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role.code,
        isPrimary: m.isPrimary,
      })),
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokensRepo.findOne({
      where: { tokenHash, revokedAt: IsNull() },
      relations: ['user'],
    });

    if (!stored || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User disabled');
    }

    let payload: { organizationId: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      }) as { organizationId: string };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const membership = await this.membershipsRepo.findOne({
      where: {
        userId: stored.userId,
        organizationId: payload.organizationId,
      },
      relations: ['role', 'role.permissions'],
    });

    if (!membership) {
      throw new UnauthorizedException('Membership no longer valid');
    }

    stored.revokedAt = new Date();
    await this.refreshTokensRepo.save(stored);

    const authUser = this.toAuthUser(
      stored.user,
      membership.organizationId,
      membership.role,
    );
    return this.issueTokens(authUser);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokensRepo.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });
    if (stored) {
      stored.revokedAt = new Date();
      await this.refreshTokensRepo.save(stored);
    }
    return { success: true };
  }

  async me(user: AuthUser) {
    // Handoff editor JWTs use synthetic user ids (editor:<documentId>) —
    // never query organization_users with that string (not a UUID).
    if (user.userId.startsWith('editor:')) {
      return {
        id: user.userId,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        role: user.role,
        permissions: user.permissions,
        organizations: [],
      };
    }

    const memberships = await this.membershipsRepo.find({
      where: { userId: user.userId },
      relations: ['organization', 'role'],
    });

    return {
      id: user.userId,
      email: user.email,
      name: user.name,
      organizationId: user.organizationId,
      role: user.role,
      permissions: user.permissions,
      organizations: memberships.map((m) => ({
        id: m.organizationId,
        name: m.organization.name,
        slug: m.organization.slug,
        role: m.role.code,
        isPrimary: m.isPrimary,
      })),
    };
  }

  private toAuthUser(user: User, organizationId: string, role: Role): AuthUser {
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      organizationId,
      role: role.code,
      permissions: (role.permissions ?? []).map((p) => p.code as PermissionCode),
    };
  }

  private async issueTokens(authUser: AuthUser) {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: authUser.userId,
        email: authUser.email,
        name: authUser.name,
        organizationId: authUser.organizationId,
        role: authUser.role,
        permissions: authUser.permissions,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      },
    );

    const refreshToken = await this.jwtService.signAsync(
      {
        sub: authUser.userId,
        organizationId: authUser.organizationId,
        type: 'refresh',
        jti: randomBytes(16).toString('hex'),
      },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '7d'),
      },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.refreshTokensRepo.save(
      this.refreshTokensRepo.create({
        userId: authUser.userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      }),
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      user: authUser,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
