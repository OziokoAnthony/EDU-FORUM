import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AD_MAX_IN_ARTICLE, articleJsonLd, breadcrumbJsonLd, type BlogCommentItem, type BlogPostDetail, type Paginated } from '@edu-forum/shared';
import { Fragment } from 'react';
import { AdSlot } from '@/components/ads/ad-slot';
import { BlogCard, blogDate, coverSrc } from '@/components/blog/blog-card';
import { BlogInteractions } from '@/components/blog/interactions';
import { JsonLd } from '@/components/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet, SITE_URL } from '@/lib/server-api';
import { adPositions, topLevelBlocks } from '@/lib/split-article';

type Props = { params: Promise<{ slug: string }> };

const tags = (slug: string) => ['blog', `blog:${slug}`];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [{ data: meta }, { data: post }] = await Promise.all([getSeoMeta(`/blog/${slug}`), serverGet<BlogPostDetail>(`/posts/by-slug/${slug}`, tags(slug))]);
  if (!meta) return {};
  const base = toMetadata(meta);
  return {
    ...base,
    openGraph: { ...base.openGraph, type: 'article', ...(post?.hasCover ? { images: [coverSrc(post)] } : {}) },
  };
}

/** `/blog/{slug}`: an approved post with Article + BreadcrumbList JSON-LD, comments and related posts. */
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const [{ data: meta }, { data: post }] = await Promise.all([getSeoMeta(`/blog/${slug}`), serverGet<BlogPostDetail>(`/posts/by-slug/${slug}`, tags(slug))]);
  if (!meta || !post) notFound();
  // Comments are in the HTML for everyone (and Google); the island takes over for signed-in actions.
  const blocks = topLevelBlocks(post.body);
  const ads = adPositions(blocks.length, AD_MAX_IN_ARTICLE);
  const { data: comments } = await serverGet<Paginated<BlogCommentItem>>(`/posts/${post.id}/comments?limit=50`, tags(slug));

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-0">
      <JsonLd data={articleJsonLd(post, SITE_URL, post.hasCover ? coverSrc(post) : undefined)} />
      <JsonLd data={breadcrumbJsonLd(meta.breadcrumbs, SITE_URL)} />
      <Breadcrumbs crumbs={meta.breadcrumbs} />

      <article className="overflow-hidden rounded-lg bg-panel shadow-sm">
        {post.hasCover ? (
          <div className="aspect-[16/9] w-full bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverSrc(post)} alt="" width={1200} height={675} className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="space-y-4 p-5 sm:p-8">
          {post.category ? (
            <Link href={`/blog/category/${post.category.slug}`} className="text-sm font-semibold uppercase text-brand hover:underline">
              {post.category.name}
            </Link>
          ) : null}
          <h1 className="text-3xl leading-tight text-slate-900 sm:text-4xl">{post.title}</h1>
          <p className="text-sm text-slate-500">
            By <span className="font-semibold text-slate-700">{post.author.name}</span> · <time dateTime={post.publishedAt}>{blogDate(post.publishedAt)}</time>
          </p>
          {/* Up to 3 in-article ads, between top-level paragraphs only (CLAUDE.md). */}
          <div className="prose-blog">
            {blocks.map((b, i) => (
              <Fragment key={i}>
                <div dangerouslySetInnerHTML={{ __html: b }} />
                {ads.includes(i) ? <AdSlot pageType="blog_post" slot="in_article" className="not-prose my-6" /> : null}
              </Fragment>
            ))}
          </div>
        </div>
        <BlogInteractions post={post} initialComments={comments} />
      </article>

      {post.related.length ? (
        <section className="space-y-3">
          <h2 className="text-xl text-slate-900">More from the blog</h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {post.related.map((r) => (
              <BlogCard key={r.id} p={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
