import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '@htveridoc/db/auth/entities/refresh-token.entity';
import { OrganizationUser } from '@htveridoc/db/users/entities/organization-user.entity';
import { Permission } from '@htveridoc/db/users/entities/permission.entity';
import { Role } from '@htveridoc/db/users/entities/role.entity';
import { User } from '@htveridoc/db/users/entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Permission,
      OrganizationUser,
      RefreshToken,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
