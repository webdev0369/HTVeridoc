import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  promises as fs,
} from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private storageRoot!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.storageRoot = path.resolve(
      this.config.get<string>('STORAGE_ROOT', './storage/htveridoc'),
    );
    mkdirSync(this.storageRoot, { recursive: true });
  }

  getDocumentOriginalPath(organizationId: string, documentId: string): string {
    return path.join(
      this.storageRoot,
      'organizations',
      organizationId,
      'documents',
      documentId,
      'original',
      'document.pdf',
    );
  }

  async saveOriginalPdf(
    organizationId: string,
    documentId: string,
    buffer: Buffer,
  ): Promise<{ relativePath: string; absolutePath: string }> {
    const absolutePath = this.getDocumentOriginalPath(
      organizationId,
      documentId,
    );
    this.assertWithinRoot(absolutePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);

    const relativePath = path.relative(this.storageRoot, absolutePath);
    return { relativePath, absolutePath };
  }

  openReadStream(relativePath: string): Readable {
    const absolutePath = this.resolveSafePath(relativePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('File not found');
    }
    return createReadStream(absolutePath);
  }

  async fileExists(relativePath: string): Promise<boolean> {
    const absolutePath = this.resolveSafePath(relativePath);
    return existsSync(absolutePath);
  }

  async readFileBuffer(relativePath: string): Promise<Buffer> {
    const absolutePath = this.resolveSafePath(relativePath);
    if (!existsSync(absolutePath)) {
      throw new NotFoundException('File not found');
    }
    return fs.readFile(absolutePath);
  }

  sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private resolveSafePath(relativePath: string): string {
    const absolutePath = path.resolve(this.storageRoot, relativePath);
    this.assertWithinRoot(absolutePath);
    return absolutePath;
  }

  private assertWithinRoot(absolutePath: string) {
    const normalizedRoot = path.resolve(this.storageRoot) + path.sep;
    const normalizedTarget = path.resolve(absolutePath);
    if (
      normalizedTarget !== path.resolve(this.storageRoot) &&
      !normalizedTarget.startsWith(normalizedRoot)
    ) {
      throw new BadRequestException('Invalid storage path');
    }
  }
}
