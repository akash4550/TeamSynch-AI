import { prisma } from '../../../config/prisma';
import { AIService } from './ai.service';
import { logger } from '../../../core/utils/logger';

export interface VectorChunkResult {
  id: string;
  documentId?: string;
  contentChunk: string;
  distance: number;
}

export class VectorService {
  private aiService = new AIService();

  /**
   * Splits document text into overlapping semantic chunks
   */
  chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
    if (!text || text.trim().length === 0) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = start + chunkSize;
      chunks.push(text.slice(start, end));
      start += chunkSize - overlap;
    }

    return chunks;
  }

  /**
   * Stores vector embedding chunks in PostgreSQL with tenant isolation
   */
  async storeVectorChunk(data: {
    organizationId: string;
    documentId?: string;
    taskId?: string;
    projectId?: string;
    contentChunk: string;
  }): Promise<void> {
    const embedding = await this.aiService.generateEmbedding(data.contentChunk);
    const vectorString = `[${embedding.join(',')}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "DocumentEmbedding" ("id", "organizationId", "documentId", "taskId", "projectId", "contentChunk", "embedding", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::vector, NOW())`,
      data.organizationId,
      data.documentId || null,
      data.taskId || null,
      data.projectId || null,
      data.contentChunk,
      vectorString
    );
  }

  /**
   * Executes cosine distance similarity search over PostgreSQL pgvector (HNSW/IVFFlat vector_cosine_ops)
   */
  async similaritySearch(
    organizationId: string,
    queryText: string,
    limit = 5
  ): Promise<VectorChunkResult[]> {
    const queryEmbedding = await this.aiService.generateEmbedding(queryText);
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
        limit
      );

      return results.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        contentChunk: r.contentChunk,
        distance: Number(r.distance),
      }));
    } catch (err: any) {
      logger.warn(`[VectorSearch] Fallback text search due to vector index state: ${err.message}`);
      // Fallback query matching tenant content chunks
      const fallback = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "id", "documentId", "contentChunk", 0.2 AS distance
         FROM "DocumentEmbedding"
         WHERE "organizationId" = $1
           AND "contentChunk" ILIKE $2
         LIMIT $3`,
        organizationId,
        `%${queryText.trim()}%`,
        limit
      );

      return fallback.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        contentChunk: r.contentChunk,
        distance: 0.2,
      }));
    }
  }
}
