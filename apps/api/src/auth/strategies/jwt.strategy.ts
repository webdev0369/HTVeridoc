import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../types/auth-user';
import { PermissionCode, RoleCode } from '../../common/enums';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  organizationId: string;
  role: RoleCode;
  permissions: PermissionCode[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub || !payload.organizationId) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      organizationId: payload.organizationId,
      role: payload.role,
      permissions: payload.permissions ?? [],
    };
  }
}
