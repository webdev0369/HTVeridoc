import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DocumentType, PermissionCode, RoleCode } from '@htveridoc/shared';
import { Document } from '@htveridoc/db/documents/entities/document.entity';
import {
  DOCUMENT_TYPE_LABELS,
  isConfigurableDocumentType,
} from '../fields/field-catalog';
import { OrganizationUser } from '@htveridoc/db/users/entities/organization-user.entity';
import { User } from '@htveridoc/db/users/entities/user.entity';
import { CreateDocumentQueueDto } from './dto/create-document-queue.dto';
import { UpdateDocumentQueueDto } from './dto/update-document-queue.dto';
import { DocumentQueueMember } from '@htveridoc/db/document-queues/entities/document-queue-member.entity';
import { DocumentQueue } from '@htveridoc/db/document-queues/entities/document-queue.entity';

export interface DocumentQueueMemberDto {
  userId: string;
  email: string;
  name: string;
}

export interface DocumentQueueDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  documentType: DocumentType;
  documentTypeLabel: string;
  isActive: boolean;
  memberCount: number;
  documentCount: number;
  members: DocumentQueueMemberDto[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DocumentQueuesService {
  constructor(
    @InjectRepository(DocumentQueue)
    private readonly queuesRepo: Repository<DocumentQueue>,
    @InjectRepository(DocumentQueueMember)
    private readonly membersRepo: Repository<DocumentQueueMember>,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    @InjectRepository(OrganizationUser)
    private readonly membershipsRepo: Repository<OrganizationUser>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async list(
    organizationId: string,
    actor: {
      userId: string;
      role: RoleCode;
      permissions: PermissionCode[];
    },
    options?: { includeInactive?: boolean },
  ): Promise<DocumentQueueDto[]> {
    const canManage = actor.permissions.includes(PermissionCode.QUEUE_MANAGE);
    const includeInactive = Boolean(options?.includeInactive) && canManage;

    const queues = await this.queuesRepo.find({
      where: includeInactive
        ? { organizationId }
        : { organizationId, isActive: true },
      order: { name: 'ASC' },
      relations: ['members'],
    });

    const visible = canManage
      ? queues
      : queues.filter((q) =>
          this.isMemberOrOpen(q, actor.userId, canManage),
        );

    return Promise.all(visible.map((q) => this.toDto(q)));
  }

  async getOne(
    organizationId: string,
    queueId: string,
    actor: {
      userId: string;
      permissions: PermissionCode[];
    },
  ): Promise<DocumentQueueDto> {
    const queue = await this.requireQueue(organizationId, queueId, true);
    const canManage = actor.permissions.includes(PermissionCode.QUEUE_MANAGE);
    if (!this.isMemberOrOpen(queue, actor.userId, canManage)) {
      throw new ForbiddenException('You do not have access to this queue');
    }
    return this.toDto(queue);
  }

  async create(
    organizationId: string,
    dto: CreateDocumentQueueDto,
  ): Promise<DocumentQueueDto> {
    this.assertDocumentType(dto.documentType);
    const name = dto.name.trim();
    await this.assertUniqueName(organizationId, name);

    const queue = this.queuesRepo.create({
      organizationId,
      name,
      description: dto.description?.trim() || null,
      documentType: dto.documentType,
      isActive: dto.isActive ?? true,
    });
    await this.queuesRepo.save(queue);

    if (dto.memberUserIds?.length) {
      await this.replaceMembers(organizationId, queue.id, dto.memberUserIds);
    }

    return this.getManaged(organizationId, queue.id);
  }

  async update(
    organizationId: string,
    queueId: string,
    dto: UpdateDocumentQueueDto,
  ): Promise<DocumentQueueDto> {
    const queue = await this.requireQueue(organizationId, queueId, false);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Name is required');
      await this.assertUniqueName(organizationId, name, queueId);
      queue.name = name;
    }
    if (dto.description !== undefined) {
      queue.description =
        dto.description === null ? null : dto.description.trim() || null;
    }
    if (dto.documentType !== undefined) {
      this.assertDocumentType(dto.documentType);
      queue.documentType = dto.documentType;
    }
    if (dto.isActive !== undefined) {
      queue.isActive = dto.isActive;
    }

    await this.queuesRepo.save(queue);

    if (dto.memberUserIds !== undefined) {
      await this.replaceMembers(organizationId, queueId, dto.memberUserIds);
    }

    return this.getManaged(organizationId, queueId);
  }

  async archive(organizationId: string, queueId: string): Promise<DocumentQueueDto> {
    const queue = await this.requireQueue(organizationId, queueId, false);
    queue.isActive = false;
    await this.queuesRepo.save(queue);
    return this.getManaged(organizationId, queueId);
  }

  /** True if the actor may see/work documents in this queue. */
  async canAccessQueue(
    organizationId: string,
    queueId: string | null | undefined,
    actor: { userId: string; permissions: PermissionCode[] },
  ): Promise<boolean> {
    if (!queueId) return true;
    // Editor-link JWTs are document-scoped (enforced in DocumentsService), not
    // real users — never compare `editor:<uuid>` to document_queue_members.user_id.
    if (actor.userId.startsWith('editor:')) return true;
    const canManage = actor.permissions.includes(PermissionCode.QUEUE_MANAGE);
    if (canManage) return true;

    const queue = await this.queuesRepo.findOne({
      where: { id: queueId, organizationId },
      relations: ['members'],
    });
    if (!queue) return false;
    return this.isMemberOrOpen(queue, actor.userId, false);
  }

  async assertCanAccessQueue(
    organizationId: string,
    queueId: string | null | undefined,
    actor: { userId: string; permissions: PermissionCode[] },
  ): Promise<void> {
    const ok = await this.canAccessQueue(organizationId, queueId, actor);
    if (!ok) {
      throw new ForbiddenException('You do not have access to this queue');
    }
  }

  async requireActiveQueueForUpload(
    organizationId: string,
    queueId: string,
    actor: { userId: string; permissions: PermissionCode[] },
  ): Promise<DocumentQueue> {
    const queue = await this.requireQueue(organizationId, queueId, true);
    if (!queue.isActive) {
      throw new BadRequestException('Queue is archived');
    }
    const canManage = actor.permissions.includes(PermissionCode.QUEUE_MANAGE);
    if (!this.isMemberOrOpen(queue, actor.userId, canManage)) {
      throw new ForbiddenException('You do not have access to this queue');
    }
    return queue;
  }

  private async getManaged(
    organizationId: string,
    queueId: string,
  ): Promise<DocumentQueueDto> {
    const queue = await this.requireQueue(organizationId, queueId, true);
    return this.toDto(queue);
  }

  private async requireQueue(
    organizationId: string,
    queueId: string,
    withMembers: boolean,
  ): Promise<DocumentQueue> {
    const queue = await this.queuesRepo.findOne({
      where: { id: queueId },
      relations: withMembers ? ['members'] : [],
    });
    if (!queue || queue.organizationId !== organizationId) {
      throw new NotFoundException('Queue not found');
    }
    return queue;
  }

  private isMemberOrOpen(
    queue: DocumentQueue,
    userId: string,
    canManage: boolean,
  ): boolean {
    if (canManage) return true;
    const members = queue.members ?? [];
    if (members.length === 0) return true; // open queue
    return members.some((m) => m.userId === userId);
  }

  private assertDocumentType(documentType: DocumentType) {
    if (
      documentType === DocumentType.UNKNOWN ||
      !isConfigurableDocumentType(documentType)
    ) {
      throw new BadRequestException(
        `Unsupported document type: ${documentType}`,
      );
    }
  }

  private async assertUniqueName(
    organizationId: string,
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.queuesRepo
      .createQueryBuilder('q')
      .where('q.organization_id = :organizationId', { organizationId })
      .andWhere('lower(q.name) = lower(:name)', { name })
      .getOne();
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`A queue named "${name}" already exists`);
    }
  }

  private async replaceMembers(
    organizationId: string,
    queueId: string,
    userIds: string[],
  ) {
    const unique = [...new Set(userIds)];
    if (unique.length) {
      const memberships = await this.membershipsRepo.find({
        where: { organizationId, userId: In(unique) },
      });
      if (memberships.length !== unique.length) {
        throw new BadRequestException(
          'One or more users are not members of this organization',
        );
      }
    }

    await this.membersRepo.delete({ queueId });
    if (!unique.length) return;

    await this.membersRepo.save(
      unique.map((userId) =>
        this.membersRepo.create({ queueId, userId }),
      ),
    );
  }

  private async toDto(queue: DocumentQueue): Promise<DocumentQueueDto> {
    const members = queue.members ?? [];
    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await this.usersRepo.find({ where: { id: In(userIds) } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const documentCount = await this.documentsRepo.count({
      where: { organizationId: queue.organizationId, queueId: queue.id },
    });

    const label =
      DOCUMENT_TYPE_LABELS[
        queue.documentType as keyof typeof DOCUMENT_TYPE_LABELS
      ] ?? queue.documentType;

    return {
      id: queue.id,
      organizationId: queue.organizationId,
      name: queue.name,
      description: queue.description,
      documentType: queue.documentType,
      documentTypeLabel: label,
      isActive: queue.isActive,
      memberCount: members.length,
      documentCount,
      members: userIds
        .map((id) => {
          const u = byId.get(id);
          if (!u) return null;
          return { userId: u.id, email: u.email, name: u.name };
        })
        .filter((m): m is DocumentQueueMemberDto => m !== null),
      createdAt: queue.createdAt,
      updatedAt: queue.updatedAt,
    };
  }
}
