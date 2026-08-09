/*
 * PGVECTOR RETRIEVER ADAPTER (ledger #22 — 2026-08-09)
 * ----------------------------------------------------
 * Read-only adapter that lets the RAG evaluation harness measure the
 * REAL production retrieval path (VectorService.similaritySearch —
 * pgvector cosine with the existing lexical fallback) against the SAME
 * labeled synthetic dataset. It changes nothing about production
 * retrieval: it only calls the existing service and maps returned
 * contentChunk text back to the dataset's stable synthetic ids
 * (production rows carry real UUIDs, so the mapping is by exact
 * normalized content match).
 *
 * Usage requires the synthetic corpus to be ingested into a scratch
 * organization's DocumentEmbedding store through the normal document
 * ingestion pipeline, plus a working embedding provider:
 *
 *   npm run eval:rag -- --retriever vector --organization <scratchOrgId>
 *
 * It is never the default retriever and is not run in CI.
 */

import { VectorService } from '../../services/vector.service';
import { CorpusChunk } from '../dataset';
import { Retriever } from './retriever.interface';

const normalize = (text: string): string => text.trim().replace(/\s+/g, ' ');

export class VectorRetriever implements Retriever {
  readonly name = 'pgvector';

  constructor(
    private readonly vectorService: VectorService,
    private readonly organizationId: string,
    private readonly corpus: readonly CorpusChunk[],
  ) {}

  async retrieve(query: string, topK: number): Promise<string[]> {
    const response = await this.vectorService.similaritySearch(
      this.organizationId,
      query,
      topK,
    );

    const idByContent = new Map(
      this.corpus.map((chunk) => [normalize(chunk.content), chunk.id]),
    );

    const ranked: string[] = [];
    for (const row of response.chunks) {
      const id = idByContent.get(normalize(row.contentChunk));
      if (id !== undefined && !ranked.includes(id)) {
        ranked.push(id);
      }
    }
    return ranked;
  }
}
