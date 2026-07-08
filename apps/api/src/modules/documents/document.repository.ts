import { Document, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { DocumentQueryDto } from './document.dto';

export class DocumentRepository {
  async create(data: Prisma.DocumentUncheckedCreateInput): Promise<Document> {
    return prisma.document.create({
      data,
    });
  }

  async findById(organizationId: string, id: string): Promise<Document | null> {
    return prisma.document.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
    });
  }

  async findByChecksum(organizationId: string, checksum: string): Promise<Document | null> {
    return prisma.document.findFirst({
      where: {
        organizationId,
        checksum,
        deletedAt: null,
      },
    });
  }

  async findMany(organizationId: string, query: DocumentQueryDto): Promise<{ data: Document[]; total: number }> {
    const { page = 1, limit = 10, search, projectId, taskId, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentWhereInput = {
      organizationId,
      deletedAt: null,
      isLatest: true,
      ...(projectId ? { projectId } : {}),
      ...(taskId ? { taskId } : {}),
      ...(search
        ? {
            OR: [
              { fileName: { contains: search, mode: 'insensitive' } },
              { originalName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy]: sortOrder },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      }),
      prisma.document.count({ where }),
    ]);

    return { data, total };
  }

  async updateSafe(id: string, organizationId: string, data: Prisma.DocumentUncheckedUpdateInput): Promise<Document> {
    const existing = await prisma.document.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new Error('Document not found');

    return prisma.document.update({
      where: { id },
      data,
    });
  }

  async getVersions(organizationId: string, documentId: string): Promise<Document[]> {
    // Find base document
    const targetDoc = await this.findById(organizationId, documentId);
    if (!targetDoc) return [];

    const rootId = targetDoc.parentDocumentId || targetDoc.id;

    return prisma.document.findMany({
      where: {
        organizationId,
        OR: [
          { id: rootId },
          { parentDocumentId: rootId },
        ],
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, avatar: true },
        },
      },
    });
  }
}
