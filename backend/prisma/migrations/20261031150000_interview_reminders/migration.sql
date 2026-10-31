-- AlterTable
ALTER TABLE "interviews" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

