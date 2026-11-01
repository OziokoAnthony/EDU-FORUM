
-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "incomplete_reminded_at" TIMESTAMP(3),
ADD COLUMN     "incomplete_reminders_sent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "vacancies" ADD COLUMN     "expiry_reminder_sent_at" TIMESTAMP(3);

