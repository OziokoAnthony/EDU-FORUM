import Link from 'next/link';
import { breadcrumbJsonLd, type BlogCategoryItem, type BlogPostListItem, type Paginated, type SeoMeta } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { SITE_URL } from '@/lib/server-api';
import { BlogCard } from './blog-card';

/** /blog and /blog/category/{slug}: one h1, category chips, cards, plain-link pagination. */
export function BlogListView({
  meta,
  posts,
  categories,
  current,
  page,
  basePath,
}: {
  meta: SeoMeta;
  posts: Paginated<BlogPostListItem> | null;
  categories: BlogCategoryItem[];
  current?: string;
  page: number;
  basePath: string;
}) {
  const pages = posts ? Math.max(1, Math.ceil(posts.meta.total / posts.meta.limit)) : 1;
  const chip = (href: string, label: string, on: boolean) => (
    <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${on ? 'bg-brand text-white' : 'bg-panel text-slate-700 shadow-sm hover:bg-slate-100'}`}>
      {label}
    </Link>
  );
  return (
    <main className="space-y-5 px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbJsonLd(meta.breadcrumbs, SITE_URL)} />
      <Breadcrumbs crumbs={meta.breadcrumbs} />
      <div className="space-y-2">
        <h1 className="text-3xl text-slate-900">{meta.h1}</h1>
        <p className="text-slate-600">Articles by teachers, principals and directors across Nigeria. Every post is checked by our team before it goes up.</p>
        <p className="text-sm">
          <Link href="/login?next=/teacher/blog" className="font-semibold text-brand hover:underline">
            Write for the blog
          </Link>
          <span className="text-slate-500"> (free, sign in first)</span>
        </p>
      </div>
      <nav aria-label="Blog categories" className="flex gap-2 overflow-x-auto pb-1">
        {chip('/blog', 'All posts', !current)}
        {categories.map((c) => chip(`/blog/category/${c.slug}`, c.name, current === c.slug))}
      </nav>
      {!posts || posts.data.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">No posts here yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {posts.data.map((p) => (
            <BlogCard key={p.id} p={p} />
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link href={page === 2 ? basePath : `${basePath}?page=${page - 1}`} className="rounded-md bg-panel px-4 py-2 font-semibold text-slate-700 shadow-sm">
              ← Newer
            </Link>
          ) : null}
          <span className="text-sm text-slate-600">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`${basePath}?page=${page + 1}`} className="rounded-md bg-panel px-4 py-2 font-semibold text-slate-700 shadow-sm">
              Older →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
