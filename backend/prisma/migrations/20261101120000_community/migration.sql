
-- CreateEnum
CREATE TYPE "CommunityLikeTarget" AS ENUM ('post', 'comment');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportTargetType" ADD VALUE 'community_post';
ALTER TYPE "ReportTargetType" ADD VALUE 'community_comment';

-- AlterEnum
ALTER TYPE "UploadPurpose" ADD VALUE 'community_photo';

-- CreateTable
CREATE TABLE "community_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_posts" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "tag" TEXT,
    "vacancy_id" UUID,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "comments_count" INTEGER NOT NULL DEFAULT 0,
    "removed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_photos" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "upload_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "removed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "community_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_likes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_type" "CommunityLikeTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_blocks" (
    "id" UUID NOT NULL,
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "community_tags_name_key" ON "community_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "community_tags_slug_key" ON "community_tags"("slug");

-- CreateIndex
CREATE INDEX "community_posts_created_at_id_idx" ON "community_posts"("created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "community_posts_tag_created_at_idx" ON "community_posts"("tag", "created_at" DESC);

-- CreateIndex
CREATE INDEX "community_posts_author_id_idx" ON "community_posts"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_photos_upload_id_key" ON "community_photos"("upload_id");

-- CreateIndex
CREATE INDEX "community_photos_post_id_position_idx" ON "community_photos"("post_id", "position");

-- CreateIndex
CREATE INDEX "community_comments_post_id_created_at_idx" ON "community_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "community_likes_target_type_target_id_idx" ON "community_likes"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_likes_user_id_target_type_target_id_key" ON "community_likes"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "community_blocks_blocked_id_idx" ON "community_blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_blocks_blocker_id_blocked_id_key" ON "community_blocks"("blocker_id", "blocked_id");

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_photos" ADD CONSTRAINT "community_photos_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_photos" ADD CONSTRAINT "community_photos_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comments" ADD CONSTRAINT "community_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_likes" ADD CONSTRAINT "community_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_blocks" ADD CONSTRAINT "community_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_blocks" ADD CONSTRAINT "community_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Starter topic tags (user, 2026-11-01); admins add or retire them later.
INSERT INTO "community_tags" ("id", "name", "slug", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'General', 'general', 1, now()),
  (gen_random_uuid(), 'Lesson ideas', 'lesson-ideas', 2, now()),
  (gen_random_uuid(), 'Exam prep (WAEC/NECO)', 'exam-prep', 3, now()),
  (gen_random_uuid(), 'Classroom management', 'classroom-management', 4, now()),
  (gen_random_uuid(), 'Job tips', 'job-tips', 5, now()),
  (gen_random_uuid(), 'Salary talk', 'salary-talk', 6, now());
