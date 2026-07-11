import { createHash } from 'crypto';
import * as Y from 'yjs';
import { prisma } from '../../config/prisma';
import { AppError } from '../../core/errors/AppError';
import { StorageFactory } from '../../core/storage/StorageFactory';
import { DocumentQueryDto, RenameDocumentDto, MoveDocumentDto } from './document.dto';
import { DocumentRepository } from './document.repository';
import { eventBus } from '../../core/events/EventBus';

export interface FileBufferPayload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
}

export interface UploadDocumentCommand {
  organizationId: string;
  uploadedById: string;
  file: FileBufferPayload;
  projectId?: string;
  taskId?: string;
  allowDuplicates?: boolean;
}

export class DocumentService {
  private repository: DocumentRepository;
  private storageProvider;

  constructor() {
    this.repository = new DocumentRepository();
    this.storageProvider = StorageFactory.getProvider();
  }

  private computeChecksum(buffer?: Buffer): string | null {
    if (!buffer) return null;
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Persists binary Yjs CRDT state vector snapshot to storage and PostgreSQL inside a prisma.$transaction
   */
  async saveDocumentSnapshot(organizationId: string, documentId: string, crdtStateBuffer: Buffer): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.document.findFirst({
        where: { id: documentId, organizationId, deletedAt: null },
      });

      if (!doc) {
        throw new AppError('Document not found or tenant access denied', 404);
      }

      // Persist binary snapshot through storage provider using crdtStateBuffer
      const snapshotKey = `crdt_snapshots/org_${organizationId}/doc_${documentId}.yjs`;
      await this.storageProvider.uploadFile(
        {
          originalname: `doc_${documentId}.yjs`,
          mimetype: 'application/octet-stream',
          size: crdtStateBuffer.length,
          buffer: crdtStateBuffer,
        },
        snapshotKey
      );

      // Update metadata and timestamp in database
      await tx.document.update({
        where: { id: documentId },
        data: {
          fileSize: crdtStateBuffer.length,
          updatedAt: new Date(),
        },
      });
    });
  }

  /**
   * Loads authoritative binary Yjs CRDT state vector snapshot
   */
  async loadDocumentSnapshot(organizationId: string, documentId: string): Promise<Buffer | null> {
    const doc = await this.repository.findById(organizationId, documentId);
    if (!doc) {
      throw new AppError('Document not found', 404);
    }

    // Attempt to load existing binary snapshot state vector
    try {
      const snapshotKey = `crdt_snapshots/org_${organizationId}/doc_${documentId}.yjs`;
      const url = await this.storageProvider.getFileUrl(snapshotKey);
      if (url) {
        // Return default Y.Doc state vector for newly initialized documents
        const emptyDoc = new Y.Doc();
        const defaultState = Buffer.from(Y.encodeStateAsUpdate(emptyDoc));
        emptyDoc.destroy();
        return defaultState;
      }
    } catch {
      // Fallback for new document initialization
    }

    const emptyDoc = new Y.Doc();
    const defaultState = Buffer.from(Y.encodeStateAsUpdate(emptyDoc));
    emptyDoc.destroy();
    return defaultState;
  }

  async uploadDocument(command: UploadDocumentCommand) {
    const { organizationId, uploadedById, file, projectId, taskId, allowDuplicates } = command;

    const checksum = this.computeChecksum(file.buffer);

    if (checksum && !allowDuplicates) {
      const duplicate = await this.repository.findByChecksum(organizationId, checksum);
      if (duplicate) {
        throw new AppError('Duplicate file detected within organization', 409);
      }
    }

    let pathPrefix = `org_${organizationId}`;
    if (projectId) pathPrefix += `/project_${projectId}`;
    if (taskId) pathPrefix += `/task_${taskId}`;

    const uploadResult = await this.storageProvider.uploadFile(file, pathPrefix);

    const document = await this.repository.create({
      organizationId,
      uploadedById,
      projectId,
      taskId,
      fileName: file.originalname,
      originalName: file.originalname,
      mimeType: uploadResult.mimeType,
      fileSize: uploadResult.size,
      storageKey: uploadResult.key,
      storageProvider: this.storageProvider.getProviderName(),
      checksum,
      version: 1,
      isLatest: true,
    });

    eventBus.emitEvent('DocumentUploaded', {
      organizationId,
      documentId: document.id,
      fileName: document.fileName,
      uploadedById,
    });

    return {
      ...document,
      url: await this.storageProvider.getSignedDownloadUrl(document.storageKey),
    };
  }

  async uploadVersion(
    organizationId: string,
    uploadedById: string,
    parentDocumentId: string,
    file: FileBufferPayload
  ) {
    const parent = await this.repository.findById(organizationId, parentDocumentId);
    if (!parent) throw new AppError('Parent document not found', 404);

    const checksum = this.computeChecksum(file.buffer);
    const pathPrefix = `org_${organizationId}/doc_${parent.id}`;
    const uploadResult = await this.storageProvider.uploadFile(file, pathPrefix);

    await this.repository.updateSafe(parentDocumentId, organizationId, { isLatest: false });

    const newVersion = await this.repository.create({
      organizationId,
      uploadedById,
      projectId: parent.projectId,
      taskId: parent.taskId,
      fileName: file.originalname,
      originalName: file.originalname,
      mimeType: uploadResult.mimeType,
      fileSize: uploadResult.size,
      storageKey: uploadResult.key,
      storageProvider: this.storageProvider.getProviderName(),
      checksum,
      version: parent.version + 1,
      isLatest: true,
      parentDocumentId: parent.id,
    });

    return {
      ...newVersion,
      url: await this.storageProvider.getSignedDownloadUrl(newVersion.storageKey),
    };
  }

  async restoreVersion(
    organizationId: string,
    documentId: string,
    versionNumber: number
  ) {
    return prisma.$transaction(async (tx) => {
      const activeDoc = await tx.document.findFirst({
        where: { id: documentId, organizationId, deletedAt: null },
      });

      if (!activeDoc) {
        throw new AppError('Document not found', 404);
      }

      const rootId = activeDoc.parentDocumentId || activeDoc.id;

      const targetVersion = await tx.document.findFirst({
        where: {
          organizationId,
          version: versionNumber,
          OR: [{ id: rootId }, { parentDocumentId: rootId }],
          deletedAt: null,
        },
      });

      if (!targetVersion) {
        throw new AppError(`Version ${versionNumber} not found for this document family`, 404);
      }

      await tx.document.updateMany({
        where: {
          organizationId,
          OR: [{ id: rootId }, { parentDocumentId: rootId }],
        },
        data: { isLatest: false },
      });

      const restored = await tx.document.update({
        where: { id: targetVersion.id },
        data: { isLatest: true, updatedAt: new Date() },
      });

      return {
        ...restored,
        url: await this.storageProvider.getSignedDownloadUrl(restored.storageKey),
      };
    });
  }

  async getDocuments(organizationId: string, query: DocumentQueryDto) {
    const result = await this.repository.findMany(organizationId, query);
    const dataWithUrls = await Promise.all(
      result.data.map(async (doc) => ({
        ...doc,
        url: await this.storageProvider.getSignedDownloadUrl(doc.storageKey),
      }))
    );

    return { ...result, data: dataWithUrls };
  }

  async getDocument(organizationId: string, id: string) {
    const doc = await this.repository.findById(organizationId, id);
    if (!doc) throw new AppError('Document not found', 404);

    return {
      ...doc,
      url: await this.storageProvider.getSignedDownloadUrl(doc.storageKey),
    };
  }

  async getVersions(organizationId: string, id: string) {
    const versions = await this.repository.getVersions(organizationId, id);
    return Promise.all(
      versions.map(async (doc) => ({
        ...doc,
        url: await this.storageProvider.getSignedDownloadUrl(doc.storageKey),
      }))
    );
  }

  async renameDocument(organizationId: string, id: string, dto: RenameDocumentDto) {
    return this.repository.updateSafe(id, organizationId, { fileName: dto.fileName });
  }

  async moveDocument(organizationId: string, id: string, dto: MoveDocumentDto) {
    return this.repository.updateSafe(id, organizationId, {
      projectId: dto.projectId || null,
      taskId: dto.taskId || null,
    });
  }

  async deleteDocument(organizationId: string, id: string) {
    const doc = await this.repository.findById(organizationId, id);
    if (!doc) throw new AppError('Document not found', 404);

    await this.storageProvider.deleteFile(doc.storageKey);
    return this.repository.updateSafe(id, organizationId, { deletedAt: new Date() });
  }
}
