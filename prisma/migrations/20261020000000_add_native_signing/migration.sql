-- CreateEnum
CREATE TYPE "SignatureFieldType" AS ENUM ('SIGNATURE', 'FULL_NAME', 'DATE', 'INITIALS', 'COMPANY');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('DRAW', 'TYPE', 'UPLOAD');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "Link" ADD COLUMN     "requireSignature" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signatureConsentRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "signatureFieldConfiguration" JSONB,
ADD COLUMN     "signatureVerificationRequired" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SignatureRecord" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "viewId" TEXT,
    "viewerEmail" TEXT NOT NULL,
    "viewerId" TEXT,
    "method" "SignatureMethod" NOT NULL,
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "consentAcceptedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedFileKey" TEXT,
    "signedFileHash" TEXT,
    "originalFileHash" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "fieldValues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureAuditEvent" (
    "id" TEXT NOT NULL,
    "signatureRecordId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignatureRecord_linkId_idx" ON "SignatureRecord"("linkId");

-- CreateIndex
CREATE INDEX "SignatureRecord_documentId_idx" ON "SignatureRecord"("documentId");

-- CreateIndex
CREATE INDEX "SignatureRecord_linkId_viewerEmail_status_idx" ON "SignatureRecord"("linkId", "viewerEmail", "status");

-- CreateIndex
CREATE INDEX "SignatureAuditEvent_signatureRecordId_idx" ON "SignatureAuditEvent"("signatureRecordId");

-- AddForeignKey
ALTER TABLE "SignatureRecord" ADD CONSTRAINT "SignatureRecord_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRecord" ADD CONSTRAINT "SignatureRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRecord" ADD CONSTRAINT "SignatureRecord_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRecord" ADD CONSTRAINT "SignatureRecord_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureAuditEvent" ADD CONSTRAINT "SignatureAuditEvent_signatureRecordId_fkey" FOREIGN KEY ("signatureRecordId") REFERENCES "SignatureRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

