import type { z } from 'zod';
import type { listDocumentsQuerySchema } from './document.validator';

export interface UploadDocumentDto {
  projectId?: string;
  taskId?: string;
}

/*
 * BUG FIX (#112): single source of truth — the query DTO is now DERIVED
 * from listDocumentsQuerySchema (document.validator.ts) so the runtime
 * validation and the compile-time contract can never drift apart
 * (previously a hand-maintained interface that nothing enforced).
 */
export type DocumentQueryDto = z.infer<typeof listDocumentsQuerySchema>;

export interface RenameDocumentDto {
  fileName: string;
}

export interface MoveDocumentDto {
  projectId?: string;
  taskId?: string;
}
