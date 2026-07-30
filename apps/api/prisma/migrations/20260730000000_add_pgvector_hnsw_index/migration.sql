-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DocumentEmbedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "contentChunk" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DocumentEmbedding_organizationId_idx" ON "DocumentEmbedding"("organizationId");

-- CreateIndex: Tenant-Scoped HNSW Vector Cosine Distance Index
CREATE INDEX IF NOT EXISTS "DocumentEmbedding_embedding_hnsw_idx" ON "DocumentEmbedding" USING hnsw (embedding vector_cosine_ops);
