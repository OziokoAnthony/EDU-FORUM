import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BLOG_PAGE_SIZE, type BlogCategoryItem, type BlogPostListItem, type Paginated } from '@edu-forum/shared';
import { BlogListView } from '@/components/blog/blog-list-view';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet } from '@/lib/server-api';

type Props = { params: Promise<{ category: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { category } = await params;
  const { data: meta } = await getSeoMeta(`/blog/category/${category}`);
  const page = Number((await searchParams).page) || 1;
  return meta ? toMetadata(meta, { noindex: page > 1 }) : {};
}

/** `/blog/category/{slug}`: indexed once the category has 3+ posts. */
export default async function Page({ params, searchParams }: Props) {
  const { category } = await params;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const [{ data: meta }, { data: posts }, { data: categories }] = await Promise.all([
    getSeoMeta(`/blog/category/${category}`),
    serverGet<Paginated<BlogPostListItem>>(`/posts?category=${encodeURIComponent(category)}&page=${page}&limit=${BLOG_PAGE_SIZE}`, ['blog']),
    serverGet<BlogCategoryItem[]>('/blog/categories', ['blog']),
  ]);
  if (!meta) notFound();
  return <BlogListView meta={meta} posts={posts} categories={categories ?? []} current={category} page={page} basePath={`/blog/category/${category}`} />;
}
