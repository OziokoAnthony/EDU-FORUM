import { z } from 'zod';

/**
 * Resources (user, 2026-11-01), uploaded by admins only:
 * - teaching materials (lesson notes, schemes of work…): anyone browses, signed-in members download;
 * - school calendar dates typed in by admins (all Nigeria or one state), shown on the home page;
 * - official exam timetables (one file per exam sitting), public pages and downloads.
 */
export const MATERIAL_KINDS = ['lesson_note', 'scheme_of_work', 'lesson_plan', 'past_questions', 'teaching_aid'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  lesson_note: 'Lesson note',
  scheme_of_work: 'Scheme of work',
  lesson_plan: 'Lesson plan',
  past_questions: 'Past questions',
  teaching_aid: 'Teaching aid',
};

export const CLASS_LEVELS = [
  ['nursery-1', 'Nursery 1'],
  ['nursery-2', 'Nursery 2'],
  ['nursery-3', 'Nursery 3'],
  ['primary-1', 'Primary 1'],
  ['primary-2', 'Primary 2'],
  ['primary-3', 'Primary 3'],
  ['primary-4', 'Primary 4'],
  ['primary-5', 'Primary 5'],
  ['primary-6', 'Primary 6'],
  ['jss-1', 'JSS 1'],
  ['jss-2', 'JSS 2'],
  ['jss-3', 'JSS 3'],
  ['ss-1', 'SS 1'],
  ['ss-2', 'SS 2'],
  ['ss-3', 'SS 3'],
] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number][0];
export const CLASS_LEVEL_SLUGS = CLASS_LEVELS.map(([s]) => s) as unknown as readonly [ClassLevel, ...ClassLevel[]];
export const classLabel = (slug: string) => CLASS_LEVELS.find(([s]) => s === slug)?.[1] ?? slug;

export const TERMS = ['first', 'second', 'third'] as const;
export type Term = (typeof TERMS)[number];
export const TERM_LABELS: Record<Term, string> = { first: 'First term', second: 'Second term', third: 'Third term' };

export const MATERIALS_PAGE_SIZE = 20;

/** POST /admin/materials (after uploading the file as `teaching_material`). */
export const createMaterialSchema = z.object({
  title: z.string().trim().min(5, 'Give the material a title').max(150),
  description: z.string().trim().min(20, 'Describe it in a sentence or two').max(2000),
  kind: z.enum(MATERIAL_KINDS),
  subject: z.string().trim().min(1).max(80).nullable().optional(),
  classLevel: z.enum(CLASS_LEVEL_SLUGS).nullable().optional(),
  term: z.enum(TERMS).nullable().optional(),
  uploadId: z.uuid(),
});
export type CreateMaterialInput = z.input<typeof createMaterialSchema>;

export const materialsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(MATERIAL_KINDS).optional(),
  subject: z.string().trim().max(80).optional(),
  classLevel: z.enum(CLASS_LEVEL_SLUGS).optional(),
  term: z.enum(TERMS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(MATERIALS_PAGE_SIZE),
});

export interface MaterialItem {
  id: string;
  slug: string;
  /** Public page, e.g. /resources/ss2-physics-scheme-of-work-first-term */
  path: string;
  title: string;
  description: string;
  kind: MaterialKind;
  subject: { slug: string; name: string } | null;
  classLevel: { slug: string; name: string } | null;
  term: Term | null;
  fileType: string;
  sizeBytes: number;
  downloads: number;
  createdAt: string;
  updatedAt: string;
}

export const CALENDAR_KINDS = ['resumption', 'midterm_break', 'end_of_term', 'public_holiday', 'exam', 'other'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];
export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = {
  resumption: 'Resumption',
  midterm_break: 'Mid-term break',
  end_of_term: 'End of term',
  public_holiday: 'Public holiday',
  exam: 'Exam',
  other: 'Other',
};

const isoDate = z.iso.date('Use the date picker');

/** POST /admin/calendar, PUT /admin/calendar/:id. No state = all of Nigeria. */
export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the date a title').max(150),
    kind: z.enum(CALENDAR_KINDS),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(),
    stateId: z.uuid().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'The end date must be on or after the start date' });
export type CalendarEventInput = z.input<typeof calendarEventSchema>;

export const calendarQuerySchema = z.object({
  /** State slug: dates for that state plus the national ones. */
  state: z.string().trim().max(80).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export interface CalendarEventItem {
  id: string;
  title: string;
  kind: CalendarKind;
  startDate: string;
  endDate: string | null;
  /** null = all of Nigeria. */
  state: { id: string; slug: string; name: string } | null;
  note: string | null;
}

/** POST /admin/exams/timetables (after uploading the file as `exam_timetable`). */
export const createTimetableSchema = z
  .object({
    examId: z.uuid(),
    year: z.coerce.number().int().min(2000).max(2100),
    session: z.string().trim().min(2, 'e.g. May/June').max(40),
    startDate: isoDate.nullable().optional(),
    endDate: isoDate.nullable().optional(),
    uploadId: z.uuid(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'The end date must be on or after the start date' });
export type CreateTimetableInput = z.input<typeof createTimetableSchema>;

export interface ExamTimetableItem {
  id: string;
  year: number;
  session: string;
  startDate: string | null;
  endDate: string | null;
  fileType: string;
  sizeBytes: number;
  /** Ready to download once the virus scan is clean. */
  ready: boolean;
  createdAt: string;
}

export interface ExamItem {
  id: string;
  slug: string;
  name: string;
  fullName: string;
  description: string | null;
  /** Public page, e.g. /exams/waec */
  path: string;
  latest: ExamTimetableItem | null;
}

export interface ExamDetail extends ExamItem {
  timetables: ExamTimetableItem[];
}

export const resourcePaths = {
  material: (slug: string) => `/resources/${slug}`,
  exam: (slug: string) => `/exams/${slug}`,
};
