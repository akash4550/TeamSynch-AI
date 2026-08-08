-- Store the small, validated organization logo in Postgres so it survives
-- application restarts on hosts with ephemeral filesystems.
CREATE TABLE "OrganizationLogo" (
    "organizationId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationLogo_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "OrganizationLogo"
ADD CONSTRAINT "OrganizationLogo_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
