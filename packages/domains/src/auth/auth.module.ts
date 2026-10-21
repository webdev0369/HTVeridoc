import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldConfigCoreModule } from '../fields/field-config.module';
import { Organization } from '@htveridoc/db/organizations/entities/organization.entity';
import { OrganizationUser } from '@htveridoc/db/users/entities/organization-user.entity';
import { Role } from '@htveridoc/db/users/entities/role.entity';
import { User } from '@htveridoc/db/users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from '@htveridoc/db/auth/entities/refresh-token.entity';
import { JwtAuthGuard } from '@htveridoc/shared/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@htveridoc/shared/auth/guards/permissions.guard';
import { JwtStrategy } from '@htveridoc/shared/auth/strategies/jwt.strategy';

/** identity only — register/login/refresh + JWT issuing */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      Organization,
      OrganizationUser,
      Role,
      RefreshToken,
    ]),
    FieldConfigCoreModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, PermissionsGuard],
  exports: [AuthService, JwtAuthGuard, PermissionsGuard, JwtModule],
})
export class AuthModule {}
