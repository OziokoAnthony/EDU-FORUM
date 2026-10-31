import Link from 'next/link';
import type { Breadcrumb } from '@edu-forum/shared';

export function Breadcrumbs({ crumbs }: { crumbs: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap gap-1 text-sm text-slate-600">
        {crumbs.map((c, i) => (
          <li key={c.path} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden>›</span> : null}
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="text-slate-800">
                {c.name}
              </span>
            ) : (
              <Link href={c.path} className="underline hover:text-emerald-800">
                {c.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
