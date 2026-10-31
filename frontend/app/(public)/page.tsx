import type { Metadata } from 'next';
import { APP_NAME } from '@edu-forum/shared';

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME} — Teaching jobs and verified teachers in Nigeria` },
  description:
    'Find teaching jobs near you across every Nigerian state, or recruit teachers by subject, level and location. Free for teachers, principals and directors.',
  alternates: { canonical: '/' },
};

// Placeholder home page; the real SSR home (search, JSON-LD, ad slot) is built in Phase 10.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold">{APP_NAME}</h1>
      <p className="mt-4 text-slate-600">
        Teaching jobs and verified teachers across Nigeria. Coming soon.
      </p>
    </main>
  );
}
