import { createHash } from 'crypto';
import { prisma } from '../../config/prisma';
import { AppError } from '../../core/errors/AppError';
import { StorageFactory } from '../../core/storage/StorageFactory';
import { DocumentQueryDto, RenameDocumentDto, MoveDocumentDto } from './document.dto';
import { DocumentRepository } from './document.repository';
import { eventBus } from '../../core/events/EventBus';
import { logger } from '../../core/utils/logger';
import { documentsQueue } from '../jobs/queues';
import {
  JOB_DOCUMENT_RAG_INGEST,
  isIngestibleDocument,
} from '../jobs/processors/rag-ingestion.processor';
import { VectorService } from '../ai/services/vector.service';

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
  private vectorService = new VectorService();

  constructor() {
    this.repository = new DocumentRepository();
    this.storageProvider = StorageFactory.getProvider();
  }

  /*
   * FEATURE (ledger #9 — RAG ingestion): every ingestible upload/replace
   * enqueues DOCUMENT_RAG_INGEST (documentsQueue worker embeds the chunks
   * for real, under a monthly token budget). "Ingestible" = text-like
   * formats plus PDF/DOCX/XLSX after ledger #12 added real binary
   * extractors (see jobs/processors/rag-ingestion.processor.ts for the
   * classifier). Fire-and-forget BY DESIGN: an upload must never fail
   * because a background job couldn't enqueue — the warn makes a skipped
   * ingestion discoverable.
   */
  private enqueueRagIngestion(
    organizationId: string,
    documentId: string,
    userId: string,
    mimeType: string,
    originalName: string
  ): void {
    if (!isIngestibleDocument(mimeType, originalName)) return;
    documentsQueue
      .add(JOB_DOCUMENT_RAG_INGEST, { organizationId, documentId, userId })
      .catch((error: unknown) => {
        logger.warn(
          `[DocumentService] RAG ingestion enqueue failed for ${documentId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
  }

  /* FEATURE (ledger #9): freshness contract — embedding chunks are wiped
   * when their documents are superseded or deleted, so the RAG chat never
   * cites stale content. Best-effort (logged), never breaks the main op. */
  private wipeEmbeddings(organizationId: string, documentIds: string[]): void {
    this.vectorService
      .deleteChunksForDocuments(organizationId, documentIds)
      .catch((error: unknown) => {
        logger.warn(
          `[DocumentService] Embedding wipe failed for ${documentIds.join(',')}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
  }

  private computeChecksum(buffer?: Buffer): string | null {
    if (!buffer) return null;
    return createHash('sha256').update(buffer).digest('hex');
  }

  /*
   * NOTE (Bug #65): the Yjs CRDT collaboration stack was removed as
   * verified dead code — `saveDocumentSnapshot` and `loadDocumentSnapshot`
   * lived here but were only ever called by crdt.server.ts, which itself
   * was never started by server.ts/app.ts, and its only client
   * (CollaborativeEditor.tsx) was deleted in the #59 sweep. The whole
   * collaborative-editing surface was unreachable end to end.
   */

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

    // Ledger #9: index for RAG (no-op for non-text formats).
    this.enqueueRagIngestion(
      organizationId,
      document.id,
      uploadedById,
      document.mimeType,
      document.originalName
    );

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
    const base = await this.repository.findById(organizationId, parentDocumentId);
    if (!base) throw new AppError('Parent document not found', 404);

    /*
     * BUG FIX (#87, 2026-08-05 — uploadVersion built a CHAIN while every
     * family consumer assumes a STAR): the old code attached the new row to
     * whatever doc id the caller passed (`parentDocumentId: parent.id`,
     * `version: parent.version + 1`, flip only that row). But getVersions,
     * restoreVersion and the #61 softDeleteFamily all resolve the family as
     * root + {parentDocumentId: root}. Two honest caller shapes therefore
     * corrupted the family:
     *   - passing the LATEST row (natural UI shape) chained v3 under v2 —
     *     getVersions(v3) resolves rootId=v2 and v1 silently vanishes from
     *     the version history, and a #61 family delete of v3 leaves v1 LIVE
     *     (invisible, storage-quota-counted forever);
     *   - passing the ROOT while head=vN produced version 2 AGAIN
     *     (v1.version+1) plus a second isLatest row — duplicate version
     *     numbers and the family listed twice (isLatest filter).
     * Concurrent uploads on the same head raced into the same corruption
     * (both read version N, both write N+1 twice).
     * Fix: resolve the family's REAL head inside one transaction, reject a
     * stale base with an honest 409 naming the current head version, flip
     * the head with the refresh-rotation double-spend guard (updateMany +
     * count===1 — airtight under Postgres row-lock re-evaluation, no
     * migration needed), and always attach the new row to the ROOT —
     * preserving the star topology every consumer is built on. The storage
     * upload stays outside the transaction; any abort best-effort deletes
     * the orphaned object (logged, never silent).
     */
    const rootId = base.parentDocumentId ?? base.id;

    const checksum = this.computeChecksum(file.buffer);
    const pathPrefix = `org_${organizationId}/doc_${rootId}`;
    const uploadResult = await this.storageProvider.uploadFile(file, pathPrefix);

    try {
      const newVersion = await prisma.$transaction(async (tx) => {
        const head = await tx.document.findFirst({
          where: {
            organizationId,
            deletedAt: null,
            isLatest: true,
            OR: [{ id: rootId }, { parentDocumentId: rootId }],
          },
        });

        if (!head) {
          throw new AppError('Parent document not found', 404);
        }

        if (head.id !== parentDocumentId) {
          throw new AppError(
            `A newer version (v${head.version}) is the head of this document family — upload the new version against it`,
            409
          );
        }

        const flip = await tx.document.updateMany({
          where: {
            id: head.id,
            organizationId,
            isLatest: true,
            deletedAt: null,
          },
          data: { isLatest: false },
        });

        if (flip.count !== 1) {
          throw new AppError(
            'A newer version was uploaded concurrently — refresh and retry against the latest version',
            409
          );
        }

        return tx.document.create({
          data: {
            organizationId,
            uploadedById,
            projectId: head.projectId,
            taskId: head.taskId,
            fileName: file.originalname,
            originalName: file.originalname,
            mimeType: uploadResult.mimeType,
            fileSize: uploadResult.size,
            storageKey: uploadResult.key,
            storageProvider: this.storageProvider.getProviderName(),
            checksum,
            version: head.version + 1,
            isLatest: true,
            // Star topology: every version attaches to the ROOT (the
            // getVersions / restoreVersion / softDeleteFamily contract).
            parentDocumentId: rootId,
          },
        });
      });

      /* Ledger #16 (dedupe-full, APPROVED 2026-08-05): NO synchronous wipe
       * here anymore. The #9-era wipe-at-flip destroyed exactly the rows
       * the content-hash reuse pool needs — every version upload re-paid
       * the full embedding spend for ~identical text. Freshness ownership
       * moved to rag-ingestion.processor's reconcile: it re-points matched
       * chunks of the outgoing head to the new one (zero tokens), embeds
       * only genuinely new text, and deletes stale leftovers before the
       * embed loop (previous-version citation window ≈ extraction time,
       * the disclosed tradeoff). */
      this.enqueueRagIngestion(
        organizationId,
        newVersion.id,
        uploadedById,
        newVersion.mimeType,
        newVersion.originalName
      );

      return {
        ...newVersion,
        url: await this.storageProvider.getSignedDownloadUrl(newVersion.storageKey),
      };
    } catch (error) {
      // The storage object was uploaded outside the transaction; an abort
      // (stale head, concurrent flip, family delete) would otherwise leak
      // bytes the tenant's storage quota never sees. Best-effort cleanup.
      await this.storageProvider
        .deleteFile(uploadResult.key)
        .catch((cleanupError: unknown) => {
          logger.warn('[DocumentService] Orphan storage cleanup failed', {
            storageKey: uploadResult.key,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          });
        });
      throw error;
    }
  }

  /* FEATURE (ledger #15 — 2026-08-05): actingUserId added (4th param, no
   * existing callers broken) so the post-restore RAG re-ingestion below
   * attributes its token spend to the user who rolled the version back. */
  async restoreVersion(
    organizationId: string,
    documentId: string,
    versionNumber: number,
    actingUserId: string
  ) {
    const restoredDoc = await prisma.$transaction(async (tx) => {
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

      return restored;
    });

    /* FEATURE (ledger #15 — restore flips the RAG truth; the restored
     * head MUST be re-ingested, so restoring no longer cites the outgoing
     * version forever. Ledger #16 (dedupe-full): the family wipe moved to
     * the worker's reconcile — keeping the chunks around through the flip
     * lets byte-identical restored content re-point at ZERO token spend
     * instead of re-embedding the file. The restored row's previous
     * ingest outcome stands until the job lands (seconds) — conservative,
     * self-healing, never a permanent "Indexing…" if enqueue fails. */
    this.enqueueRagIngestion(
      organizationId,
      restoredDoc.id,
      actingUserId,
      restoredDoc.mimeType,
      restoredDoc.originalName
    );

    return {
      ...restoredDoc,
      url: await this.storageProvider.getSignedDownloadUrl(restoredDoc.storageKey),
    };
  }

  async getDocuments(organizationId: string, query: DocumentQueryDto) {
    const result = await this.repository.findMany(organizationId, query);
    const dataWithUrls = await Promise.all(
      result.data.map(async (doc) => ({
        ...doc,
        url: await this.storageProvider.getSignedDownloadUrl(doc.storageKey),
        /* FEATURE (ledger #15 — 2026-08-05): lets the UI distinguish
         * "awaiting ingestion" (eligible, no status yet → "Indexing…")
         * from "format can never be indexed" (image/archive → "Not
         * indexable") without duplicating the classifier client-side.
         * Same predicate that gates DOCUMENT_RAG_INGEST enqueueing. */
        ingestEligible: isIngestibleDocument(doc.mimeType, doc.originalName),
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
      ingestEligible: isIngestibleDocument(doc.mimeType, doc.originalName), // #15
    };
  }

  async getVersions(organizationId: string, id: string) {
    const versions = await this.repository.getVersions(organizationId, id);
    return Promise.all(
      versions.map(async (doc) => ({
        ...doc,
        url: await this.storageProvider.getSignedDownloadUrl(doc.storageKey),
        ingestEligible: isIngestibleDocument(doc.mimeType, doc.originalName), // #15
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

  /*
   * BUG FIX (#61 — deleting a versioned document deleted ONE row of the
   * family): the previous implementation deleted only the target row's
   * storage file and soft-deleted only that row. A document is stored as a
   * FAMILY of rows — root (version 1) + one row per uploaded version
   * (`parentDocumentId = root`, see repository.getVersions) — so after
   * "Delete document":
   *   - every sibling version row stayed LIVE (deletedAt: null), and
   *     GET /documents/:id/versions kept resolving them with FRESH signed
   *     download URLs — the "deleted" document remained fully downloadable;
   *   - their file bytes stayed on disk (physical storage leak);
   *   - the plan storage quota still summed the surviving rows (entitlement
   *     usage counts non-deleted rows), so an org could "delete" everything
   *     yet remain permanently over quota — contradicting the usage bars.
   * The fix deletes the whole logical unit: resolve the family root, delete
   * EVERY member's storage object, then soft-delete EVERY family row in one
   * statement (belt-and-braces `deletedAt: null` filter makes a concurrent
   * repeat delete a no-op instead of resurrecting rows).
   */
  async deleteDocument(organizationId: string, id: string) {
    const doc = await this.repository.findById(organizationId, id);
    if (!doc) throw new AppError('Document not found', 404);

    const family = await this.repository.getVersions(organizationId, id);
    for (const member of family) {
      await this.storageProvider.deleteFile(member.storageKey);
    }

    const rootId = doc.parentDocumentId ?? doc.id;
    const result = await this.repository.softDeleteFamily(organizationId, rootId);

    // Ledger #9: deleted documents must never surface in RAG answers.
    this.wipeEmbeddings(
      organizationId,
      family.map((member) => member.id)
    );

    return result;
  }
}
