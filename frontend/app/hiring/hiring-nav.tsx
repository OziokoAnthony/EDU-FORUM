import Link from 'next/link';

/** Section links for principals and directors. */
export function HiringNav({ current }: { current: 'vacancies' | 'teachers' | 'invitations' | 'interviews' }) {
  const link = (key: typeof current, href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === key ? 'page' : undefined}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${current === key ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Hiring" className="flex gap-2 overflow-x-auto pb-1 [&>a]:shrink-0">
      {link('vacancies', '/hiring', 'My vacancies')}
      {link('teachers', '/hiring/teachers', 'Find teachers')}
      {link('invitations', '/hiring/invitations', 'Invitations')}
      {link('interviews', '/hiring/interviews', 'Interviews')}
    </nav>
  );
}
