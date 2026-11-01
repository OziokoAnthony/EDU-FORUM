import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BLOG_PAGE_SIZE, type BlogCategoryItem, type BlogPostListItem, type Paginated } from '@edu-forum/shared';
import { BlogListView } from '@/components/blog/blog-list-view';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet } from '@/lib/server-api';

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { data: meta } = await getSeoMeta('/blog');
  const page = Number((await searchParams).page) || 1;
  // ?page=2+ is noindex (canonical stays /blog), like filtered job lists.
  return meta ? toMetadata(meta, { noindex: page > 1 }) : {};
}

/** `/blog`: newest approved posts, 12 per page. */
export default async function Page({ searchParams }: Props) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [{ data: meta }, { data: posts }, { data: categories }] = await Promise.all([
    getSeoMeta('/blog'),
    serverGet<Paginated<BlogPostListItem>>(`/posts?page=${page}&limit=${BLOG_PAGE_SIZE}`, ['blog']),
    serverGet<BlogCategoryItem[]>('/blog/categories', ['blog']),
  ]);
  if (!meta) notFound();
  return <BlogListView meta={meta} posts={posts} categories={categories ?? []} page={page} basePath="/blog" />;
}
