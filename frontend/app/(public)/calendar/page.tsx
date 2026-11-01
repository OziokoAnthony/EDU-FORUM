import type { Metadata } from 'next';
import { breadcrumbJsonLd, type CalendarEventItem, type ListResponse, type StateItem } from '@edu-forum/shared';
import { JsonLd } from '@/components/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CalendarRow } from '@/components/resources/resource-bits';
import { getSeoMeta, toMetadata } from '@/lib/seo-metadata';
import { serverGet, SITE_URL } from '@/lib/server-api';

type Props = { searchParams: Promise<{ state?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { data: meta } = await getSeoMeta('/calendar');
  return meta ? toMetadata(meta, { noindex: !!(await searchParams).state }) : {};
}

const monthOf = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });

/** `/calendar`: upcoming school dates typed in by admins, grouped by month, filterable by state. */
export default async function Page({ searchParams }: Props) {
  const { state } = await searchParams;
  const qs = new URLSearchParams({ limit: '200' });
  if (state) qs.set('state', state.slice(0, 80));
  const [{ data: meta }, { data: events }, { data: states }] = await Promise.all([
    getSeoMeta('/calendar'),
    serverGet<CalendarEventItem[]>(`/calendar?${qs}`, ['calendar']),
    serverGet<ListResponse<StateItem>>('/meta/locations/states', ['meta']),
  ]);
  const crumbs = meta?.breadcrumbs ?? [{ name: 'Home', path: '/' }, { name: 'School calendar', path: '/calendar' }];
  const groups = new Map<string, CalendarEventItem[]>();
  for (const e of events ?? []) groups.set(monthOf(e.startDate), [...(groups.get(monthOf(e.startDate)) ?? []), e]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-0">
      <JsonLd data={breadcrumbJsonLd(crumbs, SITE_URL)} />
      <Breadcrumbs crumbs={crumbs} />
      <div className="space-y-1">
        <h1 className="text-3xl text-slate-900">School calendar</h1>
        <p className="text-slate-600">Resumption, mid-term breaks, end of term, public holidays and exam dates. Dates can change: always confirm with your school or state ministry.</p>
      </div>
      <form method="get" action="/calendar" className="flex flex-wrap items-end gap-2 rounded-lg bg-panel p-4 shadow-sm">
        <label className="space-y-1">
          <span className="block text-sm font-medium text-slate-800">State</span>
          <select name="state" defaultValue={state ?? ''} className="rounded-md border border-slate-300 bg-white px-3 py-2.5">
            <option value="">All of Nigeria</option>
            {(states?.data ?? []).map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-600">
          Show dates
        </button>
      </form>
      {groups.size === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">No upcoming dates yet.</p>
      ) : (
        [...groups.entries()].map(([month, list]) => (
          <section key={month} className="rounded-lg bg-panel p-4 shadow-sm">
            <h2 className="text-xl text-slate-900">{month}</h2>
            <ul className="divide-y divide-slate-100">
              {list.map((e) => (
                <CalendarRow key={e.id} e={e} />
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
