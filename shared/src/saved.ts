import { z } from 'zod';
import type { TeacherListItem, VacancyListItem } from './search';

export const SAVED_ITEM_TYPES = ['vacancy', 'teacher'] as const;
export type SavedItemType = (typeof SAVED_ITEM_TYPES)[number];

/** Confirmed 2026-10-31: instant (≈15 min), daily 7am or weekly Monday 7am (WAT); daily by default. */
export const ALERT_FREQUENCIES = ['instant', 'daily', 'weekly', 'off'] as const;
export type AlertFrequency = (typeof ALERT_FREQUENCIES)[number];
export const ALERT_FREQUENCY_LABELS: Record<AlertFrequency, string> = {
  instant: 'As soon as there is a match',
  daily: 'Daily (7am)',
  weekly: 'Weekly (Monday 7am)',
  off: 'No alerts',
};
export const MAX_SAVED_SEARCHES = 10;
/** Matches listed in one alert. */
export const ALERT_MAX_ITEMS = 10;

/** POST /saved: teachers save vacancies, principals/directors save teachers. */
export const saveItemSchema = z.object({
  itemType: z.enum(SAVED_ITEM_TYPES),
  itemId: z.uuid(),
});

export const savedQuerySchema = z.object({
  /** Is this one item saved? (save buttons) */
  itemId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SavedEntry =
  | { id: string; itemType: 'vacancy'; itemId: string; savedAt: string; vacancy: (VacancyListItem & { closed: boolean }) | null }
  | { id: string; itemType: 'teacher'; itemId: string; savedAt: string; teacher: (Omit<TeacherListItem, 'matchScore' | 'distanceKm'> & { available: boolean }) | null };

/**
 * Saved search filters: the search page's query (strings, as in the URL), without paging or
 * sorting. Checked against the vacancy or teacher search schema on the server.
 */
const filtersSchema = z
  .record(z.string().max(40), z.union([z.string().max(200), z.array(z.string().max(100)).max(20)]))
  .refine((f) => Object.keys(f).length <= 20, 'Too many filters');

const nameSchema = z.string().trim().min(1, 'Give the search a name').max(60, 'Keep the name under 60 characters');

/** POST /saved-searches */
export const savedSearchSchema = z.object({
  name: nameSchema,
  filters: filtersSchema,
  alertFrequency: z.enum(ALERT_FREQUENCIES).default('daily'),
});
export type SavedSearchInput = z.input<typeof savedSearchSchema>;

/** PATCH /saved-searches/:id (no defaults, so a partial edit keeps the rest). */
export const updateSavedSearchSchema = z.object({
  name: nameSchema.optional(),
  filters: filtersSchema.optional(),
  alertFrequency: z.enum(ALERT_FREQUENCIES).optional(),
});

export interface SavedSearchItem {
  id: string;
  scope: 'vacancies' | 'teachers';
  name: string;
  filters: Record<string, string | string[]>;
  alertFrequency: AlertFrequency;
  lastAlertedAt: string | null;
  createdAt: string;
}

/** Search-page filters → URL query (`?subjects=a,b&state=lagos`). */
export function filtersToQuery(filters: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const v = Array.isArray(value) ? value.join(',') : value;
    if (v) params.set(key, v);
  }
  return params.toString();
}
