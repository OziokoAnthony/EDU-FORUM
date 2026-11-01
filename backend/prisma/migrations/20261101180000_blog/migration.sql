-- CreateEnum
CREATE TYPE "BlogLikeTarget" AS ENUM ('post', 'comment');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PostStatus" ADD VALUE 'pending';
ALTER TYPE "PostStatus" ADD VALUE 'rejected';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportTargetType" ADD VALUE 'blog_post';
ALTER TYPE "ReportTargetType" ADD VALUE 'blog_comment';

-- AlterTable
ALTER TABLE "community_posts" ADD COLUMN     "blog_post_id" UUID;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "comments_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cover_upload_id" UUID,
ADD COLUMN     "likes_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "removed_reason" TEXT,
ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "submitted_at" TIMESTAMP(3),
ALTER COLUMN "slug" DROP NOT NULL;

-- CreateTable
CREATE TABLE "blog_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "likes_count" INTEGER NOT NULL DEFAULT 0,
    "removed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "blog_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blog_likes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_type" "BlogLikeTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_name_key" ON "blog_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "blog_categories_slug_key" ON "blog_categories"("slug");

-- CreateIndex
CREATE INDEX "blog_comments_post_id_created_at_idx" ON "blog_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "blog_comments_author_id_idx" ON "blog_comments"("author_id");

-- CreateIndex
CREATE INDEX "blog_likes_target_type_target_id_idx" ON "blog_likes"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "blog_likes_user_id_target_type_target_id_key" ON "blog_likes"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "posts_cover_upload_id_key" ON "posts"("cover_upload_id");

-- CreateIndex
CREATE INDEX "posts_category_published_at_idx" ON "posts"("category", "published_at");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_upload_id_fkey" FOREIGN KEY ("cover_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_likes" ADD CONSTRAINT "blog_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_blog_post_id_fkey" FOREIGN KEY ("blog_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Starter blog categories (user, 2026-11-01); admins add or retire them as reference data.
INSERT INTO "blog_categories" ("id", "name", "slug", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'Career tips', 'career-tips', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Exam prep', 'exam-prep', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'School news', 'school-news', 3, CURRENT_TIMESTAMP);
