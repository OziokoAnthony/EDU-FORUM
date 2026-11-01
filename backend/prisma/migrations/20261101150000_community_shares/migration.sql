-- AlterTable
ALTER TABLE "community_posts" ADD COLUMN     "shared_post_id" UUID,
ADD COLUMN     "shares_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "community_posts_shared_post_id_idx" ON "community_posts"("shared_post_id");

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_shared_post_id_fkey" FOREIGN KEY ("shared_post_id") REFERENCES "community_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

