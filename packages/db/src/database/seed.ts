import 'reflect-metadata';
import dataSource from './data-source';
import { Permission } from '../users/entities/permission.entity';
import { Role } from '../users/entities/role.entity';
import { PermissionCode, RoleCode } from '@htveridoc/shared';

const PERMISSIONS: { code: PermissionCode; description: string }[] = [
  { code: PermissionCode.DOCUMENT_READ, description: 'Read documents' },
  { code: PermissionCode.DOCUMENT_CREATE, description: 'Upload documents' },
  { code: PermissionCode.DOCUMENT_EDIT, description: 'Edit documents' },
  { code: PermissionCode.DOCUMENT_APPROVE, description: 'Approve documents' },
  { code: PermissionCode.DOCUMENT_REJECT, description: 'Reject documents' },
  { code: PermissionCode.DOCUMENT_EXPORT, description: 'Export documents' },
  {
    code: PermissionCode.QUEUE_READ,
    description: 'View document queues and background jobs',
  },
  {
    code: PermissionCode.QUEUE_MANAGE,
    description: 'Manage document queues and retry background jobs',
  },
  { code: PermissionCode.FIELD_READ, description: 'Read fields' },
  { code: PermissionCode.FIELD_MANAGE, description: 'Manage fields' },
  { code: PermissionCode.USER_READ, description: 'Read users' },
  { code: PermissionCode.USER_MANAGE, description: 'Manage users' },
  { code: PermissionCode.INTEGRATION_READ, description: 'Read integrations' },
  {
    code: PermissionCode.INTEGRATION_MANAGE,
    description: 'Manage integrations',
  },
  { code: PermissionCode.AUDIT_READ, description: 'Read audit logs' },
];

const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  [RoleCode.ADMIN]: Object.values(PermissionCode),
  [RoleCode.REVIEWER]: [
    PermissionCode.DOCUMENT_READ,
    PermissionCode.DOCUMENT_EDIT,
    PermissionCode.DOCUMENT_APPROVE,
    PermissionCode.DOCUMENT_REJECT,
    PermissionCode.QUEUE_READ,
    PermissionCode.FIELD_READ,
    PermissionCode.USER_READ,
    PermissionCode.AUDIT_READ,
  ],
  [RoleCode.OPERATOR]: [
    PermissionCode.DOCUMENT_READ,
    PermissionCode.DOCUMENT_CREATE,
    PermissionCode.DOCUMENT_EDIT,
    PermissionCode.DOCUMENT_EXPORT,
    PermissionCode.QUEUE_READ,
    PermissionCode.FIELD_READ,
    PermissionCode.INTEGRATION_READ,
  ],
  [RoleCode.VIEWER]: [
    PermissionCode.DOCUMENT_READ,
    PermissionCode.QUEUE_READ,
    PermissionCode.FIELD_READ,
    PermissionCode.USER_READ,
  ],
};

async function seed() {
  await dataSource.initialize();
  const permissionRepo = dataSource.getRepository(Permission);
  const roleRepo = dataSource.getRepository(Role);

  const permissionEntities: Permission[] = [];
  for (const p of PERMISSIONS) {
    let entity = await permissionRepo.findOne({ where: { code: p.code } });
    if (!entity) {
      entity = permissionRepo.create(p);
      await permissionRepo.save(entity);
    }
    permissionEntities.push(entity);
  }

  const byCode = new Map(permissionEntities.map((p) => [p.code, p]));

  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    let role = await roleRepo.findOne({
      where: { code: roleCode as RoleCode },
      relations: ['permissions'],
    });
    if (!role) {
      role = roleRepo.create({
        code: roleCode as RoleCode,
        name: roleCode,
        permissions: [],
      });
    }
    role.permissions = permissionCodes.map((code) => byCode.get(code)!);
    await roleRepo.save(role);
  }

  // eslint-disable-next-line no-console
  console.log('Seeded roles and permissions');
  await dataSource.destroy();
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
