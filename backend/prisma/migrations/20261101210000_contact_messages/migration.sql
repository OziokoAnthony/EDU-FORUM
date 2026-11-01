-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "user_id" UUID,
    "ip_hash" TEXT NOT NULL,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "contact_messages_email_created_at_idx" ON "contact_messages"("email", "created_at");

-- CreateIndex
CREATE INDEX "contact_messages_ip_hash_created_at_idx" ON "contact_messages"("ip_hash", "created_at");

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

