-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "agreementMeta" JSONB,
ADD COLUMN     "agreementStatus" TEXT DEFAULT 'DRAFT',
ADD COLUMN     "agreementType" TEXT;

-- CreateIndex
CREATE INDEX "Document_teamId_agreementType_idx" ON "Document"("teamId", "agreementType");
