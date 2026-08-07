import { prisma } from '../../../config/prisma';
import { env } from '../../../config/env';
import { logger } from '../../../core/utils/logger';
import { LocalStorageProvider } from '../../../core/storage/LocalStorageProvider';
import { S3StorageProvider } from '../../../core/storage/S3StorageProvider';
import { VectorService, chunkContentHash } from '../../ai/services/vector.service';
import {
  extractBinaryText,
  TextExtractionError,
  type BinaryIngestFormat,
} from '../../documents/text-extraction';
import type { BaseJobData } from '../services/job.service';
import { validateTenantJobData } from '../queues';

/*
 * FEATURE (ledger #9 — 2026-08-05): the real RAG ingestion pipeline.
 * VectorService.storeVectorChunk previously existed but NOTHING ever called
 * it — the DocumentEmbedding store stayed empty, so every RAG "retrieval"
 * was empty-context (or, worse, pseudo-embedding noise). This worker is the
 * missing producer→store path, enqueued by DocumentService on
 * upload/replace under the job name DOCUMENT_RAG_INGEST.
 *
 * Approved design (user picks, 2026-08-05):
 *   - Embeddings: OpenAI text-embedding-3-small (AI_EMBEDDING_MODEL /
 *     OPENAI_BASE_URL overridable); mock provider fails closed.
 *   - Scope (ledger #9): text-like documents. (ledger #12, 2026-08-05):
 *     REAL binary extractors added — .pdf/.docx/.xlsx (by extension OR
 *     their MIME types) are extracted via unpdf/mammoth/exceljs (see
 *     documents/text-extraction.ts). (ledger #14, 2026-08-05): slides and
 *     legacy Word joined the roster — .pptx via a jszip OPC XML walk
 *     (slides + speaker notes, numeric slide order) and .doc via
 *     word-extractor (OLE2/Word 97-2003). Legacy .xls/.ppt, images,
 *     audio/video and archives remain honestly SKIPPED with an explicit
 *     log line — .xls has no maintained safe parser (SheetJS rejected for
 *     open high-severity advisories) and naive UTF-8 decoding would stuff
 *     the vector store with binary garbage (dishonest retrieval).
 *   - Budget: per-org monthly token budget (AI_RAG_MONTHLY_TOKEN_BUDGET,
 *     default 5,000,000 ≈ $0.10 at 3-small pricing), measured from
 *     AIUsageLog feature='rag_ingest'; the worker stops honestly at the
 *     cap and reports it. Per-document cap: AI_RAG_MAX_CHARS_PER_DOC
 *     (default 250,000 chars).
 *
 * Freshness contract (REWRITTEN by ledger #16 — dedupe-full, approved
 * 2026-08-05): only the head (isLatest=true) of a document family is
 * embedded. Freshness ownership moved INTO this worker: the reconcile
 * re-points hash-matched chunks of the outgoing version to the new head
 * (zero-spend), deletes stale leftovers BEFORE the embed loop, and
 * deleteDocument still wipes the family synchronously on removal. The
 * upload/restore paths no longer wipe at flip (that would destroy the
 * reuse pool) — the previous-version citation window is bounded to
 * extraction time (seconds), the disclosed tradeoff against the old
 * synchronous-wipe zero window. The RAG chat cites only the current head.
 *
 * Status visibility (ledger #15 — 2026-08-05): every TERMINAL outcome of
 * a pass is persisted onto the document row
 * (ingestStatus / ingestedAt / ingestReason) through finish(), so the
 * Documents UI "AI Search" badge renders the truth instead of implying
 * every upload is searchable. See buildIngestPersistencePatch for the
 * honesty rules; the unexpected-throw path deliberately writes nothing.
 *
 * Failure-ordering contract (ledger #12 hardening, applies to the text
 * path too; EXTENDED by #16): the mutation phase runs only AFTER bytes
 * were read, text extracted, chunks produced, and the budget edge was
 * found clear FOR THE EMBEDS ACTUALLY NEEDED — an exhausted budget with
 * nothing new to embed no longer blocks a zero-spend reconcile, while an
 * exhausted budget with embeds pending skips with zero mutation. A failed
 * extraction or a real budget block therefore leaves any previously
 * ingested family chunks untouched — retrieval degrades to nothing only
 * when there was truly nothing, never because a retry or a budget renewal
 * is still pending.
 */

export const JOB_DOCUMENT_RAG_INGEST = 'DOCUMENT_RAG_INGEST';

/** What the pipeline can honestly turn into plain text. Derived from
 * BinaryIngestFormat so a new extractor can never be forgotten here
 * (ledger #14 — 2026-08-05). */
export type DocumentIngestFormat = 'text' | BinaryIngestFormat;

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.log', '.text',
]);
const BINARY_EXTENSIONS = new Map<string, DocumentIngestFormat>([
  ['.pdf', 'pdf'],
  ['.docx', 'docx'],
  ['.xlsx', 'xlsx'],
  ['.pptx', 'pptx'], // ledger #14 — jszip OPC walk
  ['.doc', 'doc'], // ledger #14 — word-extractor (OLE2)
]);
const BLOCKED_EXTENSIONS = new Set([
  // No extractor exists for these — skipping is the honest answer.
  // (.doc/.pptx graduated to BINARY_EXTENSIONS in ledger #14; .xls has no
  // maintained safe parser — SheetJS stays rejected — and .ppt has no
  // maintained parser at all.)
  '.xls', '.ppt',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg',
  '.zip', '.gz', '.tar', '.mp3', '.mp4', '.mov', '.webm',
]);
const TEXT_MIME_TYPES = new Set([
  'application/json', 'application/csv', 'application/x-ndjson',
]);
const BINARY_MIME_TYPES = new Map<string, DocumentIngestFormat>([
  ['application/pdf', 'pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'], // #14
  ['application/msword', 'doc'], // #14
]);

export interface RagIngestJobData extends BaseJobData {
  organizationId: string;
  documentId: string;
  // The uploader — AIUsageLog.userId is NOT NULL, and this is the user who
  // caused the token spend (cost attribution, not authorization).
  userId: string;
}

export interface RagIngestResult {
  status: 'ingested' | 'partial_budget' | 'skipped';
  reason?: string;
  chunksStored?: number;
  chunksReused?: number;
  tokensUsed?: number;
  truncated?: boolean;
}

/** FEATURE (ledger #15 — 2026-08-05): the Document-row persistence patch
 * for a terminal ingestion pass. Pure so the honesty rules are jest-pinned
 * without a database:
 *   - reason flows only for skipped/partial_budget; a success CLEARS any
 *     previous reason — a doc that recovered from a budget skip must not
 *     keep displaying the stale explanation beside its fresh "Indexed";
 *   - ingestedAt marks when THIS pass finished, for every terminal status
 *     alike (the UI always pairs it with ingestStatus, so a skip's
 *     timestamp can never read as "indexed at");
 *   - unexpectedly-thrown failures never produce a patch: with a BullMQ
 *     retry pending, the previously recorded truth stays standing. */
export const buildIngestPersistencePatch = (result: RagIngestResult) => ({
  ingestStatus: result.status,
  ingestedAt: new Date(),
  ingestReason: result.reason ?? null,
});

/* ---- ledger #16 (dedupe-full) — pure reuse planner ---------------------- */

/** One DocumentEmbedding row in the reuse pool (hash-matched, org-scoped
 * by the SQL that loaded it — foreign-tenant rows can never arrive here). */
export interface ReusePoolRow {
  id: string;
  documentId: string | null;
  chunkHash: string | null;
}

export type ChunkPlan =
  | { kind: 'repoint'; sourceRowId: string; chunk: string }
  | { kind: 'copy'; sourceRowId: string; chunk: string }
  | { kind: 'embed'; chunk: string };

/** FEATURE (ledger #16 — 2026-08-05, APPROVED dedupe-full): maps the new
 * chunk list onto the org's existing store so byte-identical text is
 * reused at ZERO token spend. Pure so the whole plan matrix is jest-pinned
 * without a database. Rules:
 *   - a FAMILY row (this document's own version line — including this
 *     head's survivor rows from a previous partial pass) is re-pointed to
 *     the head; each donor row is consumed at most once;
 *   - any other pool row (another live document, or an already-consumed
 *     family row for duplicated text within one document) donates a
 *     zero-spend COPY — never a steal (stealing would rob the donor
 *     document of its own searchability);
 *   - everything else is genuinely new text → embed. */
export const planChunkReuse = (
  chunks: string[],
  hashes: string[],
  poolRows: ReusePoolRow[],
  familyIds: ReadonlySet<string>,
): { plans: ChunkPlan[]; pendingEmbeds: number } => {
  const familyRowByHash = new Map<string, string>();
  const anyRowByHash = new Map<string, string>();
  for (const row of poolRows) {
    if (!row.chunkHash) continue;
    if (!anyRowByHash.has(row.chunkHash)) anyRowByHash.set(row.chunkHash, row.id);
    if (
      row.documentId &&
      familyIds.has(row.documentId) &&
      !familyRowByHash.has(row.chunkHash)
    ) {
      familyRowByHash.set(row.chunkHash, row.id);
    }
  }
  const consumedRowIds = new Set<string>();
  const plans = chunks.map((chunk, index) => {
    const hash = hashes[index];
    const familyRowId = familyRowByHash.get(hash);
    if (familyRowId && !consumedRowIds.has(familyRowId)) {
      consumedRowIds.add(familyRowId);
      return { kind: 'repoint', sourceRowId: familyRowId, chunk } as ChunkPlan;
    }
    const donorRowId = anyRowByHash.get(hash) ?? familyRowId;
    if (donorRowId) return { kind: 'copy', sourceRowId: donorRowId, chunk } as ChunkPlan;
    return { kind: 'embed', chunk } as ChunkPlan;
  });
  return {
    plans,
    pendingEmbeds: plans.filter((plan) => plan.kind === 'embed').length,
  };
};

/** Single source of truth for format eligibility. Extension wins when it is
 * conclusive (known-good or known-blocked); otherwise the MIME type decides.
 * Returns null when no honest text path exists. */
export const classifyDocumentIngest = (
  mimeType: string,
  originalName: string,
): DocumentIngestFormat | null => {
  const lower = (originalName || '').toLowerCase();
  const ext = lower.match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (ext && BLOCKED_EXTENSIONS.has(ext)) return null;
  if (ext && TEXT_EXTENSIONS.has(ext)) return 'text';
  const binaryKind = ext ? BINARY_EXTENSIONS.get(ext) : undefined;
  if (binaryKind) return binaryKind;
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('text/') || TEXT_MIME_TYPES.has(mime)) return 'text';
  return BINARY_MIME_TYPES.get(mime) ?? null;
};

/** Boolean compatibility shim — DocumentService imports this to avoid
 * enqueueing jobs that would only self-skip. */
export const isIngestibleDocument = (mimeType: string, originalName: string): boolean =>
  classifyDocumentIngest(mimeType, originalName) !== null;

/** UTF-8 decode + strip bytes that poison embeddings/lexical search. */
const decodeTextBytes = (buffer: Buffer): string =>
  sanitizeExtractedText(buffer.toString('utf8'));

/** Strip control bytes that poison embeddings/lexical search (Postgres TEXT
 * rejects NUL; form-feed/vertical-tab fragment chunks). Applied to text
 * and binary-extractor output alike. */
const sanitizeExtractedText = (text: string): string =>
  text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const monthStart = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

/** Read object bytes regardless of which provider stored them. The stored
 * row records its provider at upload time (post-migration deployments can
 * be mixed), so dispatch is per-row, not per-process. */
const readDocumentBytes = async (
  storageProvider: string,
  storageKey: string,
): Promise<Buffer> => {
  if (storageProvider === 's3') {
    const s3 = new S3StorageProvider();
    const url = await s3.getSignedDownloadUrl(storageKey, 300);
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`S3 read-back failed with HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  return new LocalStorageProvider().getFileBuffer(storageKey);
};

export const ragIngestionProcessor = async (job: { name: string; data: RagIngestJobData }): Promise<RagIngestResult> => {
  const data = validateTenantJobData(job.data);
  const { organizationId, documentId, userId } = data;

  // 1. Tenant-scoped row load — a tampered/foreign documentId can never
  //    pull another org's bytes into the pipeline.
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId, deletedAt: null },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      storageKey: true,
      storageProvider: true,
      isLatest: true,
      parentDocumentId: true, // ledger #16: reuse pool is family-scoped
    },
  });

  if (!document) {
    return { status: 'skipped', reason: 'document not found in organization' };
  }

  /* FEATURE (ledger #15): single-writer outcome persistence. updateMany
   * (not update) so a delete-race between the row load above and this
   * write resolves to a no-op instead of a P2025 crash on an already-
   * computed honest result. */
  const finish = async (result: RagIngestResult): Promise<RagIngestResult> => {
    await prisma.document.updateMany({
      where: { id: document.id, organizationId },
      data: buildIngestPersistencePatch(result),
    });
    return result;
  };

  if (!document.isLatest) {
    // Only the family head is embedded; a stale enqueue after a version
    // flip is a no-op, never a double-store. The skip IS recorded — a
    // superseded badge claiming "Indexed" would imply stale citations.
    return finish({ status: 'skipped', reason: 'superseded document version' });
  }
  const format = classifyDocumentIngest(document.mimeType, document.originalName);
  if (!format) {
    logger.info(
      `[RagIngest] Skipping ${document.originalName} (${document.mimeType}) — no extractor for this format`,
    );
    return finish({ status: 'skipped', reason: 'format not text-extractable' });
  }

  // 2. Read bytes + extract text. Failures here happen BEFORE the chunk
  //    wipe below, so whatever this head had stored stays stored.
  let buffer: Buffer;
  try {
    buffer = await readDocumentBytes(document.storageProvider, document.storageKey);
  } catch (error) {
    logger.warn(
      `[RagIngest] Document bytes unreadable for ${documentId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return finish({ status: 'skipped', reason: 'document bytes unavailable' });
  }

  let text: string;
  try {
    text =
      format === 'text'
        ? decodeTextBytes(buffer)
        : sanitizeExtractedText(await extractBinaryText(format, buffer));
    if (format !== 'text') {
      logger.info(
        `[RagIngest] Extracted ${text.length} chars from ${format} document ${document.originalName}`,
      );
    }
  } catch (error) {
    if (error instanceof TextExtractionError && !error.retryable) {
      // Corrupt/encrypted/mislabeled bytes: retrying can never succeed, so
      // skip honestly instead of burning BullMQ attempts.
      logger.info(
        `[RagIngest] Skipping ${document.originalName} — ${error.reason}`,
      );
      return finish({ status: 'skipped', reason: error.reason });
    }
    // Unexpected extractor failure → rethrow; the queue retries and, if it
    // keeps failing, the job FAILED state makes it visible. Ledger #15:
    // deliberately NO finish() here — with a retry pending, the previously
    // recorded outcome stays the badge truth; only terminal passes stamp.
    logger.error(
      `[RagIngest] Extraction crashed for ${document.originalName} (${format}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    throw error;
  }

  if (text.trim().length === 0) {
    return finish({ status: 'skipped', reason: 'no extractable text' });
  }

  const maxChars = env.AI_RAG_MAX_CHARS_PER_DOC;
  const truncated = text.length > maxChars;
  if (truncated) {
    logger.info(
      `[RagIngest] Truncating ${document.originalName} to ${maxChars} chars (AI_RAG_MAX_CHARS_PER_DOC)`,
    );
    text = text.slice(0, maxChars);
  }

  // 3. Chunk.
  const vectorService = new VectorService();
  const chunks = vectorService.chunkText(text);
  if (chunks.length === 0) {
    return finish({ status: 'skipped', reason: 'no extractable text' });
  }

  // 4. Content-hash reuse pool (FEATURE ledger #16 — APPROVED dedupe-full,
  //    user decision 2026-08-05): byte-identical chunks are re-pointed /
  //    copy-inserted from the org's existing store at ZERO token spend
  //    instead of being re-embedded. Freshness ownership moved HERE from
  //    document.service (which no longer wipes at version flip/upload —
  //    that wipe would destroy exactly the rows the reuse pool needs).
  //    The reconcile below deletes this family's leftover (genuinely
  //    removed) chunks BEFORE the slow embed loop, so the previous-version
  //    citation window is bounded to extraction time rather than zero, as
  //    disclosed in the approved tradeoff. Pool matching never crosses the
  //    tenant key; family rows are re-pointed, other-document rows only
  //    donate copies (stealing would rob the donor of its searchability).
  const hashes = chunks.map(chunkContentHash);
  const rootId = document.parentDocumentId ?? document.id;
  const familyMembers = await prisma.document.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ id: rootId }, { parentDocumentId: rootId }],
    },
    select: { id: true },
  });
  const familyIds = new Set<string>(familyMembers.map((member) => member.id));
  familyIds.add(document.id); // belt: the head's own row is always family

  const poolRows = (await prisma.$queryRawUnsafe(
    `SELECT "id", "documentId", "chunkHash" FROM "DocumentEmbedding"
     WHERE "organizationId" = $1 AND "chunkHash" = ANY($2::text[])`,
    organizationId,
    hashes,
  )) as ReusePoolRow[];

  const { plans, pendingEmbeds } = planChunkReuse(chunks, hashes, poolRows, familyIds);

  // 5. Budget gate (spend profile CHANGED by #16): only 'embed' plans
  //    spend tokens. Exhausted budget with pending embeds → honest skip
  //    with NO mutation at all — every previously stored family chunk
  //    stays put (#12 contract kept). Exhausted budget with NOTHING left
  //    to embed → the zero-spend reconcile still runs: leaving a document
  //    unsearchable when making it searchable costs nothing would be an
  //    artificial, dishonest outage.
  const budget = env.AI_RAG_MONTHLY_TOKEN_BUDGET;
  const spentRow = await prisma.aIUsageLog.aggregate({
    _sum: { totalTokens: true },
    where: {
      organizationId,
      feature: 'rag_ingest',
      createdAt: { gte: monthStart() },
    },
  });
  const spent = spentRow._sum.totalTokens ?? 0;

  if (spent >= budget && pendingEmbeds > 0) {
    logger.warn(
      `[RagIngest] Monthly RAG token budget (${budget}) exhausted for org ${organizationId} with ${pendingEmbeds} new chunks to embed — ingestion deferred`,
    );
    return finish({
      status: 'skipped',
      reason: `monthly RAG token budget exhausted (${spent}/${budget})`,
    });
  }

  // 6. Reconcile mutation phase — the #12 ordering contract is preserved:
  //    nothing below runs until extraction succeeded and the budget edge
  //    was cleared.
  //    6a. Freshness & retry idempotency: delete this FAMILY's chunks that
  //        are not being re-pointed (genuinely removed text becomes
  //        uncitable BEFORE the slow embed loop; survivor rows of a
  //        previous partial pass are matched by hash and excluded by the
  //        id list, so retries converge without double-store).
  const repointedRowIds = plans
    .filter((plan) => plan.kind === 'repoint')
    .map((plan) => plan.sourceRowId);
  await prisma.$executeRawUnsafe(
    `DELETE FROM "DocumentEmbedding"
     WHERE "organizationId" = $1
       AND "documentId" = ANY($2::text[])
       AND "id" <> ALL($3::text[])`,
    organizationId,
    [...familyIds],
    repointedRowIds,
  );

  //    6b. Badge consistency (#15 × #16): after the wipe, every non-head
  //        family row carries no chunks; their badges must stop claiming
  //        an earlier "Indexed" outcome. Honest even if the embed loop
  //        later crashes — the family truth now lives on the head (the job
  //        FAILED state covers the incomplete part).
  await prisma.document.updateMany({
    where: {
      organizationId,
      deletedAt: null,
      id: { in: [...familyIds].filter((id) => id !== document.id) },
    },
    data: {
      ingestStatus: 'skipped',
      ingestReason: 'superseded document version',
      ingestedAt: new Date(),
    },
  });

  //    6c. Zero-spend reuse stores + embed loop in document order. The
  //        budget edge stops EMBEDDING only; reuses before the edge still
  //        land free. Coverage after a forced stop is reported as
  //        partial_budget, never claimed complete.
  let tokensUsed = 0;
  let chunksStored = 0;
  let chunksReused = 0;
  for (const plan of plans) {
    if (plan.kind === 'repoint') {
      await prisma.$executeRawUnsafe(
        `UPDATE "DocumentEmbedding" SET "documentId" = $1 WHERE "id" = $2 AND "organizationId" = $3`,
        document.id,
        plan.sourceRowId,
        organizationId,
      );
      chunksReused += 1;
      chunksStored += 1;
      continue;
    }
    if (plan.kind === 'copy') {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "DocumentEmbedding" ("id", "organizationId", "documentId", "contentChunk", "chunkHash", "embedding", "createdAt")
         SELECT gen_random_uuid(), $1, $2, "contentChunk", "chunkHash", "embedding", NOW()
         FROM "DocumentEmbedding" WHERE "id" = $3 AND "organizationId" = $4`,
        organizationId,
        document.id,
        plan.sourceRowId,
        organizationId,
      );
      chunksReused += 1;
      chunksStored += 1;
      continue;
    }
    if (spent + tokensUsed >= budget) {
      logger.warn(
        `[RagIngest] Budget edge mid-document for org ${organizationId}: stored ${chunksStored}/${chunks.length} chunks (${chunksReused} reused zero-spend)`,
      );
      return finish({
        status: 'partial_budget',
        reason: `monthly RAG token budget reached (${spent + tokensUsed}/${budget})`,
        chunksStored,
        chunksReused,
        tokensUsed,
        truncated,
      });
    }
    const { tokensUsed: chunkTokens } = await vectorService.storeVectorChunk({
      organizationId,
      documentId: document.id,
      contentChunk: plan.chunk,
      actingUserId: userId,
    });
    tokensUsed += chunkTokens;
    chunksStored += 1;
  }

  logger.info(
    `[RagIngest] Ingested ${document.originalName}: ${chunksStored} chunks (${chunksReused} reused zero-spend), ${tokensUsed} tokens (org ${organizationId})`,
  );
  return finish({ status: 'ingested', chunksStored, chunksReused, tokensUsed, truncated });
};
