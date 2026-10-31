'use client';

import { InterviewsList } from '@/components/interviews-page';
import { HiringNav } from '../hiring-nav';

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <HiringNav current="interviews" />
      <h1 className="text-3xl text-slate-900">Interviews</h1>
      <InterviewsList as="poster" empty="No upcoming interviews. Schedule one from an applicant's page." />
    </main>
  );
}
