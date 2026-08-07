import { createHash } from 'node:crypto';
import { prisma } from '../../../config/prisma';
import { AIService } from './ai.service';
import { AIProviderError } from '../providers/ai-provider.error';
import { AppError } from '../../../core/errors/AppError';
import { logger } from '../../../core/utils/logger';

/* FEATURE (ledger #16 — 2026-08-05): canonical content hash for the
 * chunk-dedupe reuse pool. Must be byte-identical to the SQL backfill
 * (encode(digest(contentChunk,'sha256'),'hex')) so pre-#16 rows join the
 * pool without re-embedding. Exported for the ingestion processor's pool
 * matching; storeVectorChunk is the single write-side user. */
export const chunkContentHash = (contentChunk: string): string =>
  createHash('sha256').update(contentChunk, 'utf8').digest('hex');

export interface VectorChunkResult {
  id: string;
  documentId?: string;
  contentChunk: string;
  // Ledger #9: nullable — only a real vector distance populates this. The
  // lexical fallback reports NULL (previously hardcoded 0.2, which the web
  // chat turned into a fabricated "80% Match" badge).
  distance: number | null;
}

export interface SimilaritySearchResponse {
  chunks: VectorChunkResult[];
  // 'vector' = pgvector cosine search; 'text_fallback' = pg_trgm/tsvector
  // lexical match with NULL distances (honest "text match" in the UI).
  retrievalMethod: 'vector' | 'text_fallback';
}

/*
 * Feature availability pre-flight result. VectorService.similaritySearch
 * consults this ONCE per process (memoized) to decide between pgvector and
 * the lexical fallback instead of running a doomed cosine query and
 * catching the error on every request.
 */
interface VectorProvisioner {
  tableReady: boolean;
  checkedAt: number;
}
let provisionState: VectorProvisioner | null = null;

export class VectorService {
  private aiService = new AIService();

  // Must match prisma schema vector(1536). Swapping AI_EMBEDDING_MODEL to a
  // different-dimension model requires a new migration AND this knob.
  private readonly expectedDims = parseInt(process.env.AI_EMBEDDING_DIMS || '1536', 10);

  /*
   * Splits document text into overlapping chunks. Defaults: 1000 chars with
   * 200 overlap (5 chunks per ~4KB page). Ledger #9 hardening:
   * overlap >= chunkSize previously made `start` advance by <= 0 —
   * an INFINITE LOOP (or a same-chunk unbounded loop) on any caller that
   * mixed the arguments up; invalid configs now throw immediately.
   */
  chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
    if (chunkSize <= 0) {
      throw new AppError('chunkSize must be positive', 500);
    }
    if (overlap < 0 || overlap >= chunkSize) {
      throw new AppError('overlap must be >= 0 and < chunkSize', 500);
    }
    if (!text || text.trim().length === 0) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = start + chunkSize;
      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) chunks.push(chunk);
      start += chunkSize - overlap;
    }

    return chunks;
  }

  /*
   * Stores one chunk with its REAL provider embedding (ledger #9).
   * Returns the billed token usage so the ingestion worker can enforce the
   * per-org monthly budget; throws (skipping the INSERT) when the provider
   * returns a dimension set that would corrupt the vector(1536) column.
   */
  async storeVectorChunk(data: {
    organizationId: string;
    documentId?: string;
    taskId?: string;
    projectId?: string;
    contentChunk: string;
    actingUserId?: string;
  }): Promise<{ tokensUsed: number }> {
    const { embedding, totalTokens } = await this.aiService.generateEmbedding(
      data.contentChunk,
      data.actingUserId
        ? {
            organizationId: data.organizationId,
            userId: data.actingUserId,
            feature: 'rag_ingest',
          }
        : undefined,
    );

    if (embedding.length !== this.expectedDims) {
      throw new AppError(
        `Embedding dimension mismatch: provider returned ${embedding.length}, expected ${this.expectedDims} (AI_EMBEDDING_DIMS must match the migrated vector column)`,
        500,
      );
    }

    const vectorString = `[${embedding.join(',')}]`;

    // ledger #16: persist the content hash so future passes can reuse
    // this row's embedding for byte-identical text at zero token spend.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DocumentEmbedding" ("id", "organizationId", "documentId", "taskId", "projectId", "contentChunk", "chunkHash", "embedding", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::vector, NOW())`,
      data.organizationId,
      data.documentId || null,
      data.taskId || null,
      data.projectId || null,
      data.contentChunk,
      chunkContentHash(data.contentChunk),
      vectorString,
    );

    return { tokensUsed: totalTokens };
  }

  /*
   * FEATURE (ledger #9): document lifecycle hygiene. uploadNewVersion wipes
   * the whole family before embedding its new head, and deleteDocument
   * wipes the family on removal — the RAG chat can never cite superseded
   * or deleted content. Tenant key always applied alongside the id set.
   */
  async deleteChunksForDocuments(
    organizationId: string,
    documentIds: string[],
  ): Promise<{ deleted: number }> {
    if (documentIds.length === 0) return { deleted: 0 };
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM "DocumentEmbedding" WHERE "organizationId" = $1 AND "documentId" = ANY($2)`,
      organizationId,
      documentIds,
    );
    return { deleted: typeof result === 'number' ? result : 0 };
  }

  /*
   * FEATURE (ledger #9): security sweep — hard-deletes every embedding row
   * for a tenant (documents, tasks, projects). Parameterized; rows outside
   * `documentIds` are unaffected by design (tenant key is authoritative).
   */
  async deleteChunksForOrganization(organizationId: string): Promise<{ deleted: number }> {
    const result = await prisma.$executeRawUnsafe(
      `DELETE FROM "DocumentEmbedding" WHERE "organizationId" = $1`,
      organizationId,
    );
    return { deleted: typeof result === 'number' ? result : 0 };
  }

  /*
   * One-time-per-process provisioning probe: is the DocumentEmbedding table
   * present with a usable vector index? A missing table (migration not yet
   * applied, or pgvector absent on a non-docker Postgres) switches search
   * to the lexical fallback for the PROCESS LIFETIME — no more per-request
   * doomed cosine query + error-catch lottery. Re-checks after 60s so a
   * just-applied migration is picked up without a restart.
   */
  private async isVectorStoreReady(): Promise<boolean> {
    if (provisionState && Date.now() - provisionState.checkedAt < 60_000) {
      return provisionState.tableReady;
    }
    try {
      await prisma.$queryRawUnsafe(`SELECT 1 FROM "DocumentEmbedding" LIMIT 1`);
      provisionState = { tableReady: true, checkedAt: Date.now() };
    } catch {
      provisionState = { tableReady: false, checkedAt: Date.now() };
    }
    return provisionState.tableReady;
  }

  /*
   * Cosine similarity over pgvector. Ledger #9 changes:
   *   1. Availability is pre-flighted (memoized) — no doomed query per
   *      request while pgvector is unprovisioned.
   *   2. Embedding-provider failures (no API key, rate limit, outage)
   *      surface as an HONEST 503 to the chat UI instead of silently
   *      degrading into fake lexical results: a broken question-embedding
   *      is a service failure, not a "no matches" answer.
   *   3. The fallback is REAL lexical retrieval — pg_trgm word_similarity,
   *      else ILIKE — with `distance: null` (0.2-as-distance fabrication
   *      killed) and retrievalMethod='text_fallback' so the UI can label
   *      the mode truthfully.
   *   4. Empty corpus short-circuits BEFORE spending an embedding call.
   */
  async similaritySearch(
    organizationId: string,
    queryText: string,
    limit = 5,
    actingUserId?: string,
  ): Promise<SimilaritySearchResponse> {
    const trimmed = queryText.trim();

    // Empty corpus: embedding the question would be spent money for zero
    // possible hits (the old code embedded first and asked later).
    const counter = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
      `SELECT COUNT(*) AS n FROM "DocumentEmbedding" WHERE "organizationId" = $1`,
      organizationId,
    ).catch(() => null);
    if (counter && Number(counter[0]?.n ?? 0) === 0) {
      return { chunks: [], retrievalMethod: 'text_fallback' };
    }

    if (await this.isVectorStoreReady()) {
      let queryEmbedding: number[] | null = null;
      let embeddingError: AIProviderError | null = null;
      try {
        const embedded = await this.aiService.generateEmbedding(trimmed, actingUserId
          ? { organizationId, userId: actingUserId, feature: 'rag_query' }
          : undefined);
        queryEmbedding = embedded.embedding;
      } catch (error: unknown) {
        embeddingError =
          error instanceof AIProviderError
            ? error
            : new AIProviderError('AI embedding request failed', {
                provider: 'unknown',
                model: 'unknown',
                statusCode: 502,
              });
      }

      if (embeddingError) {
        // The question cannot be embedded — this is a provider outage or
        // missing configuration, NOT an absence of matching documents.
        // Honest 503 so the chat UI can say "search unavailable" instead of
        // pretending the corpus has nothing relevant.
        logger.warn(
          `[VectorSearch] Embedding provider unavailable; refusing fabricated fallback: ${embeddingError.message}`,
        );
        throw new AppError(
          'Semantic search is temporarily unavailable (embedding provider unreachable)',
          503,
        );
      }

      if (queryEmbedding && queryEmbedding.length === this.expectedDims) {
        const vectorString = `[${queryEmbedding.join(',')}]`;
        try {
          const results = await prisma.$queryRawUnsafe<any[]>(
            `SELECT "id", "documentId", "contentChunk", ("embedding" <=> $1::vector) AS distance
             FROM "DocumentEmbedding"
             WHERE "organizationId" = $2
             ORDER BY distance ASC
             LIMIT $3`,
            vectorString,
            organizationId,
            limit,
          );

          return {
            chunks: results.map((r) => ({
              id: r.id,
              documentId: r.documentId ?? undefined,
              contentChunk: r.contentChunk,
              distance: r.distance === null ? null : Number(r.distance),
            })),
            retrievalMethod: 'vector',
          };
        } catch (err: any) {
          // pgvector present (probe passed) but query failed anyway — fall
          // through to HONEST lexical retrieval (table is queryable, the
          // vector column/index may not be).
          logger.warn(
            `[VectorSearch] Cosine query failed after healthy probe; using lexical fallback: ${err.message}`,
          );
        }
      } else if (queryEmbedding) {
        throw new AppError(
          `Embedding dimension mismatch: provider returned ${queryEmbedding.length}, expected ${this.expectedDims}`,
          500,
        );
      }
    }

    return this.lexicalFallback(organizationId, trimmed, limit);
  }

  /*
   * Honest lexical retrieval for deployments without pgvector. Distances
   * are ALWAYS null (nothing about trigram similarity maps to a cosine
   * distance — pretending otherwise was the "80% Match" fabrication).
   */
  private async lexicalFallback(
    organizationId: string,
    queryText: string,
    limit: number,
  ): Promise<SimilaritySearchResponse> {
    try {
      // pg_trgm word_similarity — real fuzzy relevance ordering.
      const results = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id", "documentId", "contentChunk",
                word_similarity($1, "contentChunk") AS ws
         FROM "DocumentEmbedding"
         WHERE "organizationId" = $2
           AND word_similarity($1, "contentChunk") > 0
         ORDER BY ws DESC
         LIMIT $3`,
        queryText,
        organizationId,
        limit,
      );

      if (results.length > 0) {
        return {
          chunks: results.map((r) => ({
            id: r.id,
            documentId: r.documentId ?? undefined,
            contentChunk: r.contentChunk,
            distance: null,
          })),
          retrievalMethod: 'text_fallback',
        };
      }
    } catch (err: any) {
      logger.warn(`[VectorSearch] Trigram fallback unavailable (${err.message}); trying ILIKE`);
    }

    // Last resort: substring containment (works without any extension).
    const fallback = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "documentId", "contentChunk"
       FROM "DocumentEmbedding"
       WHERE "organizationId" = $1
         AND "contentChunk" ILIKE $2
       LIMIT $3`,
      organizationId,
      `%${queryText}%`,
      limit,
    );

    return {
      chunks: fallback.map((r) => ({
        id: r.id,
        documentId: r.documentId ?? undefined,
        contentChunk: r.contentChunk,
        distance: null,
      })),
      retrievalMethod: 'text_fallback',
    };
  }
}
