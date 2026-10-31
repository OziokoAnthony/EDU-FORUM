-- Principals and directors replace school accounts; identity verification and school
-- onboarding are dropped (user decisions, 2026-10-31). Only test data existed at this point.

-- Uploads for purposes that no longer exist (school logos, ID documents) would block the enum change.
DELETE FROM "uploads" WHERE "purpose"::text IN ('identity_document', 'identity_selfie', 'school_logo');
-- There are no school pages any more, so their ad slot goes too.
DELETE FROM "ad_settings" WHERE "page_type"::text = 'school';

-- AlterEnum
BEGIN;
CREATE TYPE "AdPageType_new" AS ENUM ('home', 'job_search', 'landing', 'job_detail', 'blog_post');
ALTER TABLE "ad_settings" ALTER COLUMN "page_type" TYPE "AdPageType_new" USING ("page_type"::text::"AdPageType_new");
ALTER TYPE "AdPageType" RENAME TO "AdPageType_old";
ALTER TYPE "AdPageType_new" RENAME TO "AdPageType";
DROP TYPE "public"."AdPageType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ReportTargetType_new" AS ENUM ('teacher_profile', 'vacancy', 'message');
ALTER TABLE "reports" ALTER COLUMN "target_type" TYPE "ReportTargetType_new" USING ("target_type"::text::"ReportTargetType_new");
ALTER TYPE "ReportTargetType" RENAME TO "ReportTargetType_old";
ALTER TYPE "ReportTargetType_new" RENAME TO "ReportTargetType";
DROP TYPE "public"."ReportTargetType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UploadPurpose_new" AS ENUM ('cv', 'profile_photo', 'qualification_file', 'certification_file', 'message_attachment', 'post_cover');
ALTER TABLE "uploads" ALTER COLUMN "purpose" TYPE "UploadPurpose_new" USING ("purpose"::text::"UploadPurpose_new");
ALTER TYPE "UploadPurpose" RENAME TO "UploadPurpose_old";
ALTER TYPE "UploadPurpose_new" RENAME TO "UploadPurpose";
DROP TYPE "public"."UploadPurpose_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('teacher', 'principal', 'director', 'admin');
-- Former school accounts become directors.
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE WHEN "role"::text IN ('school_owner', 'recruiter') THEN 'director' ELSE "role"::text END
)::"UserRole_new";
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_school_id_fkey";

-- DropForeignKey
ALTER TABLE "identity_documents" DROP CONSTRAINT "identity_documents_resubmission_of_fkey";

-- DropForeignKey
ALTER TABLE "identity_documents" DROP CONSTRAINT "identity_documents_reviewed_by_fkey";

-- DropForeignKey
ALTER TABLE "identity_documents" DROP CONSTRAINT "identity_documents_school_id_fkey";

-- DropForeignKey
ALTER TABLE "identity_documents" DROP CONSTRAINT "identity_documents_teacher_id_fkey";

-- DropForeignKey
ALTER TABLE "profile_views" DROP CONSTRAINT "profile_views_school_id_fkey";

-- DropForeignKey
ALTER TABLE "school_invites" DROP CONSTRAINT "school_invites_invited_by_fkey";

-- DropForeignKey
ALTER TABLE "school_invites" DROP CONSTRAINT "school_invites_school_id_fkey";

-- DropForeignKey
ALTER TABLE "school_members" DROP CONSTRAINT "school_members_invited_by_fkey";

-- DropForeignKey
ALTER TABLE "school_members" DROP CONSTRAINT "school_members_school_id_fkey";

-- DropForeignKey
ALTER TABLE "school_members" DROP CONSTRAINT "school_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "schools" DROP CONSTRAINT "schools_lga_id_fkey";

-- DropForeignKey
ALTER TABLE "schools" DROP CONSTRAINT "schools_state_id_fkey";

-- DropForeignKey
ALTER TABLE "vacancies" DROP CONSTRAINT "vacancies_school_id_fkey";

-- DropIndex
DROP INDEX "conversations_school_id_teacher_id_key";

-- DropIndex
DROP INDEX "vacancies_school_id_status_idx";

-- AlterTable
ALTER TABLE "conversations" DROP COLUMN "school_id",
ADD COLUMN     "employer_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "profile_views" DROP COLUMN "school_id";

-- AlterTable
ALTER TABLE "vacancies" DROP COLUMN "school_id",
ADD COLUMN     "school_name" TEXT;

-- DropTable
DROP TABLE "identity_documents";

-- DropTable
DROP TABLE "school_invites";

-- DropTable
DROP TABLE "school_members";

-- DropTable
DROP TABLE "schools";

-- DropEnum
DROP TYPE "ContactTitle";

-- DropEnum
DROP TYPE "DocumentOwnerType";

-- DropEnum
DROP TYPE "IdentityDocType";

-- DropEnum
DROP TYPE "PopulationBand";

-- DropEnum
DROP TYPE "SchoolMemberRole";

-- DropEnum
DROP TYPE "SchoolMemberStatus";

-- DropEnum
DROP TYPE "SchoolOwnership";

-- CreateIndex
CREATE UNIQUE INDEX "conversations_employer_id_teacher_id_key" ON "conversations"("employer_id", "teacher_id");

-- CreateIndex
CREATE INDEX "vacancies_created_by_status_idx" ON "vacancies"("created_by", "status");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

