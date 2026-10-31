import type { Page } from '@playwright/test';

// Real stack: API dev server (BullMQ worker, Backblaze B2, ClamAV) + Mailpit.
export const MAILPIT = 'http://localhost:8025/api/v1';
export const API = 'http://localhost:4000/api/v1';
export const CV_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

/** The newest email to `to` whose subject contains `subject` (waits up to ~10 s). */
export async function latestEmail(to: string, subject = ''): Promise<{ Subject: string; Text: string }> {
  for (let i = 0; i < 40; i++) {
    const search = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}" ${subject ? `subject:"${subject}"` : ''}`)}`).then((r) => r.json());
    const id = search.messages?.[0]?.ID;
    if (id) return fetch(`${MAILPIT}/message/${id}`).then((r) => r.json());
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${to} (${subject})`);
}

export type Caller = (path: string, method?: string, body?: unknown) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Registers and verifies an account through the API; returns a caller signed in as it. */
export async function account(email: string, role: 'teacher' | 'principal' | 'director'): Promise<Caller> {
  const reg = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'teach2026', role, consent: true }),
  }).then((r) => r.json());
  const token = /token=([\w-]+)/.exec((await latestEmail(email, 'Confirm')).Text)![1];
  await fetch(`${API}/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  return async (path, method = 'GET', body) => {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${reg.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
}

/** Reference ids the tests need. */
export async function reference() {
  const json = (p: string) => fetch(`${API}${p}`).then((r) => r.json());
  const lagos = (await json('/meta/locations/states')).data.find((s: { slug: string }) => s.slug === 'lagos');
  const ikeja = (await json('/meta/locations/lgas?state=lagos')).data.find((l: { slug: string }) => l.slug === 'ikeja');
  const bed = (await json('/meta/qualification-types')).data.find((q: { slug: string }) => q.slug === 'b-ed');
  return { lagos, ikeja, bed };
}

/** A published teacher built through the API, with a real CV upload to B2 + ClamAV. */
export async function publishedTeacher(call: Caller, fullName: string) {
  const { lagos, ikeja, bed } = await reference();
  await call('/teachers/me/personal', 'PATCH', { fullName, gender: 'female', dob: '1994-05-12' });
  await call('/teachers/me/location', 'PUT', { stateId: lagos.id, lgaId: ikeja.id, addressLine: '12 Secret Close', lat: 6.6, lng: 3.35 });
  await call('/teachers/me/preferences', 'PUT', { subjects: ['physics'], levels: ['sss'], jobTypes: ['full_time'] });
  await call('/teachers/me/qualifications', 'POST', { qualificationTypeId: bed.id, course: 'Physics Education', institution: 'UNILAG', yearObtained: 2017 });
  await call('/teachers/me/experiences', 'POST', { schoolName: 'Kings College', role: 'Physics teacher', startDate: '2018-01-08', isCurrent: true });
  const signed = await call('/uploads/sign', 'POST', { purpose: 'cv', fileName: 'ada-cv.pdf', mimeType: 'application/pdf', sizeBytes: CV_PDF.length });
  await fetch(signed.url, { method: 'PUT', headers: signed.headers, body: CV_PDF });
  await call('/teachers/me/cv', 'POST', { uploadId: signed.uploadId });
  for (let i = 0; i < 120; i++) {
    if ((await call('/teachers/me/cv')).active?.scanStatus === 'clean') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await call('/teachers/me/publish', 'POST');
}

export async function liveVacancy(call: Caller, title: string, extra: Record<string, unknown> = {}) {
  const { lagos, ikeja } = await reference();
  return call('/vacancies', 'POST', {
    title,
    subjects: ['physics'],
    levels: ['sss'],
    jobType: 'full_time',
    salaryMin: 150000,
    salaryMax: 220000,
    description: '<p>We need a passionate Physics teacher for SS1 to SS3, preparing students for WAEC and NECO and running lab practicals.</p>',
    schoolName: 'Greenfield Academy',
    stateId: lagos.id,
    lgaId: ikeja.id,
    lat: 6.6,
    lng: 3.35,
    publish: true,
    ...extra,
  });
}

export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password').fill('teach2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
}
