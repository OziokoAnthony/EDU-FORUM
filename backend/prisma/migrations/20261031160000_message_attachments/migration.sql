-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attachment_mime" TEXT,
ADD COLUMN     "attachment_size" INTEGER,
ADD COLUMN     "attachment_upload_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "messages_attachment_upload_id_key" ON "messages"("attachment_upload_id");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_attachment_upload_id_fkey" FOREIGN KEY ("attachment_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

