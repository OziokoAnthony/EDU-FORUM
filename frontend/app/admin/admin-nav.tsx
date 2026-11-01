import Link from 'next/link';

const LINKS = [
  ['overview', '/admin', 'Overview'],
  ['reports', '/admin/reports', 'Reports'],
  ['blog', '/admin/blog', 'Blog'],
  ['users', '/admin/users', 'Users'],
  ['vacancies', '/admin/vacancies', 'Vacancies'],
  ['teachers', '/admin/teachers', 'Teachers'],
  ['reference', '/admin/reference', 'Reference data'],
  ['audit', '/admin/audit', 'Audit log'],
] as const;

export type AdminSection = (typeof LINKS)[number][0];

export function AdminNav({ current }: { current: AdminSection }) {
  return (
    <nav aria-label="Admin" className="flex gap-2 overflow-x-auto pb-1">
      {LINKS.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? 'page' : undefined}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${current === key ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Asks the admin for the reason an action needs (suspend, takedown, hide). */
export function askReason(what: string): string | null {
  const reason = window.prompt(`Reason to ${what} (sent to the user and kept in the audit log):`);
  if (reason === null) return null;
  return reason.trim().length >= 3 ? reason.trim() : (window.alert('Please give a reason of at least 3 characters.'), null);
}
