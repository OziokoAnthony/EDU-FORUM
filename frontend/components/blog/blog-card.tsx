import Link from 'next/link';
import type { BlogPostListItem } from '@edu-forum/shared';
import { API_URL } from '@/lib/api';

/** Cover photos come through GET /posts/:id/cover (a redirect to a fresh short-lived link). */
export const coverSrc = (p: { id: string; updatedAt: string }) => `${API_URL}/posts/${p.id}/cover?v=${encodeURIComponent(p.updatedAt)}`;

export const blogDate = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });

/** A post in the blog list (server-rendered; fixed cover box so nothing shifts while loading). */
export function BlogCard({ p }: { p: BlogPostListItem }) {
  return (
    <li className="lift overflow-hidden rounded-lg bg-panel shadow-sm">
      <Link href={p.path} className="block">
        <div className="aspect-[16/9] w-full bg-slate-100">
          {p.hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc(p)} alt="" width={640} height={360} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div aria-hidden className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-50 to-slate-100 text-4xl font-extrabold text-brand/30">
              {p.title.charAt(0)}
            </div>
          )}
        </div>
        <div className="space-y-1.5 p-4">
          {p.category ? <p className="text-xs font-semibold uppercase text-brand">{p.category.name}</p> : null}
          <h2 className="text-lg leading-snug text-slate-900">{p.title}</h2>
          <p className="line-clamp-3 text-sm text-slate-600">{p.excerpt}</p>
          <p className="text-xs text-slate-500">
            {p.author.name} · {blogDate(p.publishedAt)} · {p.likes} {p.likes === 1 ? 'like' : 'likes'} · {p.comments} {p.comments === 1 ? 'comment' : 'comments'}
          </p>
        </div>
      </Link>
    </li>
  );
}
