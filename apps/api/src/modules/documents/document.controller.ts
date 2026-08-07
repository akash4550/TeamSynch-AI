import { Request, Response } from 'express';
import { AppError } from '../../core/errors/AppError';
import { DocumentService, FileBufferPayload } from './document.service';
import { uploadDocumentSchema, renameDocumentSchema, moveDocumentSchema, listDocumentsQuerySchema } from './document.validator';

const documentService = new DocumentService();

/*
 * BUG FIX (#46 — documents module answered errors OFF-contract): every
 * handler wrapped itself in try/catch and replied
 * `res.status(error.statusCode || 400).json({ error: error.message })`.
 * That broke the API's own error contract ({ success:false, requestId,
 * error:{ message } }) in three ways, all user-visible:
 *   1. The web client's extractor (`err.response?.data?.error?.message`)
 *      reads `.message` off an OBJECT envelope; here `error` was a bare
 *      string, so every upload/rename/move/delete failure degraded to a
 *      generic "please try again" — the server's real reason (validation
 *      detail, not-found, quota) never reached the UI.
 *   2. `error.statusCode || 400` mislabeled everything unexpected: a plain
 *      internal Error (e.g. storage-layer failure) was shipped to the
 *      client as HTTP 400 WITH ITS RAW MESSAGE — leaking internals.
 *   3. No `requestId` was included, so client reports couldn't be
 *      correlated with server logs.
 * Handlers now throw AppError for guard clauses and let zod/service errors
 * propagate to errorMiddleware (routes are asyncWrapper-wrapped), the same
 * convention as every other module. Success response shapes
 * (201 {data}, {data}, getAll's raw result, 204) are UNCHANGED.
 */
export class DocumentController {
  async upload(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const uploadedById = req.user!.id;
    const file = req.file;

    if (!file) {
      throw new AppError('No file provided', 400);
    }

    const dto = uploadDocumentSchema.parse(req.body);

    const filePayload: FileBufferPayload = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
      path: file.path,
    };

    const document = await documentService.uploadDocument({
      organizationId,
      uploadedById,
      file: filePayload,
      projectId: dto.projectId,
      taskId: dto.taskId,
    });

    res.status(201).json({ data: document });
  }

  async uploadVersion(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const uploadedById = req.user!.id;
    const parentDocumentId = String(req.params.id);
    const file = req.file;

    if (!file) {
      throw new AppError('No file provided', 400);
    }

    const filePayload: FileBufferPayload = {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      buffer: file.buffer,
      path: file.path,
    };

    const document = await documentService.uploadVersion(
      organizationId,
      uploadedById,
      parentDocumentId,
      filePayload
    );

    res.status(201).json({ data: document });
  }

  async restoreVersion(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const documentId = String(req.params.id);
    const versionNumber = Number(req.params.versionNumber);

    if (isNaN(versionNumber) || versionNumber < 1) {
      throw new AppError('Invalid version number', 400);
    }

    const restoredDoc = await documentService.restoreVersion(
      organizationId,
      documentId,
      versionNumber,
      req.user!.id // ledger #15: acting user for the RAG re-ingest spend attribution
    );

    res.json({ data: restoredDoc });
  }

  async getAll(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    /*
     * BUG FIX (#112, 2026-08-06): raw req.query flowed into Prisma — the
     * only unvalidated list query in the API (garbage sortBy/page →
     * opaque 500; unbounded limit → read amplification). Parse first,
     * same module self-validation convention as upload/rename/move; the
     * success contract ({ data, total } raw result) stays UNCHANGED.
     */
    const query = listDocumentsQuerySchema.parse(req.query);
    const result = await documentService.getDocuments(organizationId, query);
    // NOTE: raw service result (not { data }) — long-standing success
    // contract consumed by the web list; left intentionally unchanged.
    res.json(result);
  }

  async getOne(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const id = String(req.params.id);
    const document = await documentService.getDocument(organizationId, id);
    res.json({ data: document });
  }

  async getVersions(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const id = String(req.params.id);
    const versions = await documentService.getVersions(organizationId, id);
    res.json({ data: versions });
  }

  async rename(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const dto = renameDocumentSchema.parse(req.body);
    const id = String(req.params.id);
    const document = await documentService.renameDocument(organizationId, id, dto);
    res.json({ data: document });
  }

  async move(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const dto = moveDocumentSchema.parse(req.body);
    const id = String(req.params.id);
    const document = await documentService.moveDocument(organizationId, id, dto);
    res.json({ data: document });
  }

  async delete(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const id = String(req.params.id);
    await documentService.deleteDocument(organizationId, id);
    res.status(204).send();
  }
}
