import { Request, Response } from 'express';
import { DocumentService, FileBufferPayload } from './document.service';
import { uploadDocumentSchema, renameDocumentSchema, moveDocumentSchema } from './document.validator';

const documentService = new DocumentService();

export class DocumentController {
  async upload(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const uploadedById = req.user!.id;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
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
    } catch (error: any) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  }

  async uploadVersion(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const uploadedById = req.user!.id;
      const parentDocumentId = String(req.params.id);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
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
    } catch (error: any) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  }

  async restoreVersion(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const documentId = String(req.params.id);
      const versionNumber = Number(req.params.versionNumber);

      if (isNaN(versionNumber) || versionNumber < 1) {
        return res.status(400).json({ error: 'Invalid version number' });
      }

      const restoredDoc = await documentService.restoreVersion(
        organizationId,
        documentId,
        versionNumber
      );

      res.json({ data: restoredDoc });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  }

  async getAll(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const result = await documentService.getDocuments(organizationId, req.query);
      res.json(result);
    } catch (error: any) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  }

  async getOne(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const id = String(req.params.id);
      const document = await documentService.getDocument(organizationId, id);
      res.json({ data: document });
    } catch (error: any) {
      res.status(error.statusCode || 404).json({ error: error.message });
    }
  }

  async getVersions(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const id = String(req.params.id);
      const versions = await documentService.getVersions(organizationId, id);
      res.json({ data: versions });
    } catch (error: any) {
      res.status(error.statusCode || 404).json({ error: error.message });
    }
  }

  async rename(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const dto = renameDocumentSchema.parse(req.body);
      const id = String(req.params.id);
      const document = await documentService.renameDocument(organizationId, id, dto);
      res.json({ data: document });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  }

  async move(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const dto = moveDocumentSchema.parse(req.body);
      const id = String(req.params.id);
      const document = await documentService.moveDocument(organizationId, id, dto);
      res.json({ data: document });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const organizationId = req.user!.organizationId;
      const id = String(req.params.id);
      await documentService.deleteDocument(organizationId, id);
      res.status(204).send();
    } catch (error: any) {
      res.status(error.statusCode || 400).json({ error: error.message });
    }
  }
}
