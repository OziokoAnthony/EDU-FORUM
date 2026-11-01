'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  CALENDAR_KIND_LABELS,
  CALENDAR_KINDS,
  CLASS_LEVELS,
  MATERIAL_KIND_LABELS,
  MATERIAL_KINDS,
  TERM_LABELS,
  TERMS,
  type CalendarEventItem,
  type CalendarKind,
  type ExamItem,
  type ExamTimetableItem,
  type ListResponse,
  type MaterialItem,
  type MaterialKind,
  type MetaItem,
  type SignablePurpose,
  type StateItem,
} from '@edu-forum/shared';
import { Alert, Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { uploadFile, UploadError } from '@/lib/upload';
import { AdminNav } from '../admin-nav';

type Tab = 'materials' | 'calendar' | 'exams';
const input = 'block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5';
const label = 'block text-sm font-medium text-slate-800';
const errText = (err: unknown) =>
  err instanceof UploadError ? err.message : err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : 'Something went wrong. Try again.';

/** Resources (user, 2026-11-01; admins only): teaching materials, school calendar, exam timetables. */
export default function Page() {
  const [tab, setTab] = useState<Tab>('materials');
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <AdminNav current="resources" />
      <h1 className="text-2xl text-slate-900">Resources</h1>
      <div role="tablist" aria-label="Resources" className="flex flex-wrap gap-2">
        {(
          [
            ['materials', 'Teaching materials'],
            ['calendar', 'School calendar'],
            ['exams', 'Exam timetables'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-brand text-white' : 'bg-panel text-slate-700 shadow-sm'}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'materials' ? <Materials /> : tab === 'calendar' ? <Calendar /> : <Timetables />}
    </main>
  );
}

function FileField({ id, accept, file, onChange }: { id: string; accept: string; file: File | null; onChange: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={label}>
        File
      </label>
      <input ref={ref} id={id} type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      <p className="text-xs text-slate-500">{file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'Up to 5 MB. Checked for viruses before it appears.'}</p>
    </div>
  );
}

// ───────────── teaching materials ─────────────

function Materials() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin-materials'], queryFn: () => authed<(MaterialItem & { status: 'scanning' | 'ready' })[]>('/admin/materials') });
  const subjects = useQuery({ queryKey: ['meta', 'subjects'], queryFn: () => api<ListResponse<MetaItem>>('/meta/subjects'), staleTime: 3600_000 });
  const blank = { title: '', description: '', kind: 'lesson_note' as MaterialKind, subject: '', classLevel: '', term: '' };
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [key, setKey] = useState(0);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setMsg({ kind: 'error', text: 'Choose the file to upload.' });
    setBusy(true);
    setMsg(null);
    try {
      const uploadId = await uploadFile(authed, 'teaching_material' as SignablePurpose, file);
      await authed('/admin/materials', {
        method: 'POST',
        body: { ...form, subject: form.subject || null, classLevel: form.classLevel || null, term: form.term || null, uploadId },
      });
      setForm(blank);
      setFile(null);
      setKey((k) => k + 1);
      setMsg({ kind: 'success', text: 'Uploaded. It appears on the site once the virus check finishes (usually under a minute).' });
      await qc.invalidateQueries({ queryKey: ['admin-materials'] });
    } catch (err) {
      setMsg({ kind: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? It disappears from the site.`)) return;
    await authed(`/admin/materials/${id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['admin-materials'] });
  }

  return (
    <div className="space-y-4">
      <form key={key} onSubmit={submit} noValidate className="grid gap-3 rounded-lg bg-panel p-4 shadow-sm sm:grid-cols-2">
        <h2 className="text-lg text-slate-900 sm:col-span-2">Upload a teaching material</h2>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="m-title" className={label}>
            Title
          </label>
          <input id="m-title" value={form.title} onChange={set('title')} placeholder="e.g. SS2 Physics scheme of work, first term" className={input} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="m-desc" className={label}>
            Description
          </label>
          <textarea id="m-desc" rows={3} value={form.description} onChange={set('description')} className={input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="m-kind" className={label}>
            Type
          </label>
          <select id="m-kind" value={form.kind} onChange={set('kind')} className={input}>
            {MATERIAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {MATERIAL_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="m-subject" className={label}>
            Subject (optional)
          </label>
          <select id="m-subject" value={form.subject} onChange={set('subject')} className={input}>
            <option value="">Any subject</option>
            {(subjects.data?.data ?? []).map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="m-class" className={label}>
            Class (optional)
          </label>
          <select id="m-class" value={form.classLevel} onChange={set('classLevel')} className={input}>
            <option value="">Any class</option>
            {CLASS_LEVELS.map(([s, n]) => (
              <option key={s} value={s}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="m-term" className={label}>
            Term (optional)
          </label>
          <select id="m-term" value={form.term} onChange={set('term')} className={input}>
            <option value="">Any term</option>
            {TERMS.map((t) => (
              <option key={t} value={t}>
                {TERM_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <FileField id="m-file" accept=".pdf,.doc,.docx,.ppt,.pptx" file={file} onChange={setFile} />
        </div>
        {msg ? (
          <div className="sm:col-span-2">
            <Alert kind={msg.kind}>{msg.text}</Alert>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} className="sm:w-auto">
            Upload material
          </Button>
        </div>
      </form>

      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : list.data.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">No materials yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.data.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel p-3 shadow-sm">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{m.title}</p>
                <p className="text-sm text-slate-600">
                  {MATERIAL_KIND_LABELS[m.kind]} · {m.fileType} · {m.downloads} downloads · {m.status === 'ready' ? 'Live' : 'Checking for viruses…'}
                </p>
              </div>
              <div className="flex gap-3 text-sm font-semibold">
                {m.status === 'ready' ? (
                  <Link href={m.path} className="text-brand hover:underline">
                    View
                  </Link>
                ) : null}
                <button type="button" onClick={() => void remove(m.id, m.title)} className="text-red-700 hover:underline">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────── school calendar ─────────────

function Calendar() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin-calendar'], queryFn: () => authed<CalendarEventItem[]>('/admin/calendar') });
  const states = useQuery({ queryKey: ['meta', 'states'], queryFn: () => api<ListResponse<StateItem>>('/meta/locations/states'), staleTime: 3600_000 });
  const blank = { title: '', kind: 'resumption' as CalendarKind, startDate: '', endDate: '', stateId: '', note: '' };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = { ...form, endDate: form.endDate || null, stateId: form.stateId || null, note: form.note || null };
      await authed(editing ? `/admin/calendar/${editing}` : '/admin/calendar', { method: editing ? 'PUT' : 'POST', body });
      setForm(blank);
      setEditing(null);
      setMsg({ kind: 'success', text: editing ? 'Date updated.' : 'Date added. It shows on the home page and the calendar.' });
      await qc.invalidateQueries({ queryKey: ['admin-calendar'] });
    } catch (err) {
      setMsg({ kind: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: CalendarEventItem) {
    if (!window.confirm(`Delete "${e.title}"?`)) return;
    await authed(`/admin/calendar/${e.id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['admin-calendar'] });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} noValidate className="grid gap-3 rounded-lg bg-panel p-4 shadow-sm sm:grid-cols-2">
        <h2 className="text-lg text-slate-900 sm:col-span-2">{editing ? 'Edit date' : 'Add a date'}</h2>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="c-title" className={label}>
            Title
          </label>
          <input id="c-title" value={form.title} onChange={set('title')} placeholder="e.g. Second term resumes" className={input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="c-kind" className={label}>
            Kind
          </label>
          <select id="c-kind" value={form.kind} onChange={set('kind')} className={input}>
            {CALENDAR_KINDS.map((k) => (
              <option key={k} value={k}>
                {CALENDAR_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="c-state" className={label}>
            Where
          </label>
          <select id="c-state" value={form.stateId} onChange={set('stateId')} className={input}>
            <option value="">All of Nigeria</option>
            {(states.data?.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="c-start" className={label}>
            Start date
          </label>
          <input id="c-start" type="date" value={form.startDate} onChange={set('startDate')} className={input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="c-end" className={label}>
            End date (optional)
          </label>
          <input id="c-end" type="date" value={form.endDate} onChange={set('endDate')} className={input} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="c-note" className={label}>
            Note (optional)
          </label>
          <input id="c-note" value={form.note} onChange={set('note')} placeholder="e.g. Federal Government approved" className={input} />
        </div>
        {msg ? (
          <div className="sm:col-span-2">
            <Alert kind={msg.kind}>{msg.text}</Alert>
          </div>
        ) : null}
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={busy} className="sm:w-auto">
            {editing ? 'Save date' : 'Add date'}
          </Button>
          {editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(blank);
              }}
              className="rounded-lg px-4 font-semibold text-slate-600 hover:underline"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : list.data.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">No dates yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel p-3 shadow-sm">
              <div>
                <p className="font-semibold text-slate-900">{e.title}</p>
                <p className="text-sm text-slate-600">
                  {CALENDAR_KIND_LABELS[e.kind]} · {e.startDate}
                  {e.endDate ? ` to ${e.endDate}` : ''} · {e.state?.name ?? 'All Nigeria'}
                </p>
              </div>
              <div className="flex gap-3 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(e.id);
                    setForm({ title: e.title, kind: e.kind, startDate: e.startDate, endDate: e.endDate ?? '', stateId: e.state?.id ?? '', note: e.note ?? '' });
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="text-brand hover:underline"
                >
                  Edit
                </button>
                <button type="button" onClick={() => void remove(e)} className="text-red-700 hover:underline">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────────── exam timetables ─────────────

function Timetables() {
  const { authed } = useAuth();
  const qc = useQueryClient();
  const exams = useQuery({ queryKey: ['exams'], queryFn: () => api<ExamItem[]>('/exams') });
  const list = useQuery({ queryKey: ['admin-timetables'], queryFn: () => authed<(ExamTimetableItem & { exam: { id: string; name: string } })[]>('/admin/exams/timetables') });
  const blank = { examId: '', year: String(new Date().getFullYear()), session: '', startDate: '', endDate: '' };
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [key, setKey] = useState(0);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.examId) return setMsg({ kind: 'error', text: 'Choose the exam.' });
    if (!file) return setMsg({ kind: 'error', text: 'Choose the timetable file.' });
    setBusy(true);
    setMsg(null);
    try {
      const uploadId = await uploadFile(authed, 'exam_timetable' as SignablePurpose, file);
      await authed('/admin/exams/timetables', { method: 'POST', body: { ...form, startDate: form.startDate || null, endDate: form.endDate || null, uploadId } });
      setForm(blank);
      setFile(null);
      setKey((k) => k + 1);
      setMsg({ kind: 'success', text: 'Uploaded. It appears on the exam page once the virus check finishes.' });
      await qc.invalidateQueries({ queryKey: ['admin-timetables'] });
    } catch (err) {
      setMsg({ kind: 'error', text: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this timetable?')) return;
    await authed(`/admin/exams/timetables/${id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['admin-timetables'] });
  }

  return (
    <div className="space-y-4">
      <form key={key} onSubmit={submit} noValidate className="grid gap-3 rounded-lg bg-panel p-4 shadow-sm sm:grid-cols-2">
        <h2 className="text-lg text-slate-900 sm:col-span-2">Upload an exam timetable</h2>
        <div className="space-y-1">
          <label htmlFor="t-exam" className={label}>
            Exam
          </label>
          <select id="t-exam" value={form.examId} onChange={set('examId')} className={input}>
            <option value="">Choose the exam</option>
            {(exams.data ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="t-year" className={label}>
              Year
            </label>
            <input id="t-year" inputMode="numeric" value={form.year} onChange={set('year')} className={input} />
          </div>
          <div className="space-y-1">
            <label htmlFor="t-session" className={label}>
              Session
            </label>
            <input id="t-session" value={form.session} onChange={set('session')} placeholder="May/June" className={input} />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="t-start" className={label}>
            First paper (optional)
          </label>
          <input id="t-start" type="date" value={form.startDate} onChange={set('startDate')} className={input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="t-end" className={label}>
            Last paper (optional)
          </label>
          <input id="t-end" type="date" value={form.endDate} onChange={set('endDate')} className={input} />
        </div>
        <div className="sm:col-span-2">
          <FileField id="t-file" accept=".pdf,.jpg,.jpeg,.png" file={file} onChange={setFile} />
        </div>
        {msg ? (
          <div className="sm:col-span-2">
            <Alert kind={msg.kind}>{msg.text}</Alert>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} className="sm:w-auto">
            Upload timetable
          </Button>
        </div>
      </form>
      <p className="text-sm text-slate-600">
        Add or retire exams under{' '}
        <Link href="/admin/reference" className="font-semibold text-brand hover:underline">
          Reference data → Exams
        </Link>
        .
      </p>

      {list.isPending ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.isError ? (
        <Alert>{list.error.message}</Alert>
      ) : list.data.length === 0 ? (
        <p className="rounded-lg bg-panel p-6 text-center text-slate-600 shadow-sm">No timetables yet.</p>
      ) : (
        <ul className="space-y-2">
          {list.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel p-3 shadow-sm">
              <div>
                <p className="font-semibold text-slate-900">
                  {t.exam.name}: {t.session} {t.year}
                </p>
                <p className="text-sm text-slate-600">
                  {t.fileType} · {t.ready ? 'Live' : 'Checking for viruses…'}
                </p>
              </div>
              <button type="button" onClick={() => void remove(t.id)} className="text-sm font-semibold text-red-700 hover:underline">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
