import { z } from 'zod';

/**
 * AdSense ad spaces (CLAUDE.md AdSense rules; user 2026-11-01: built switched off, admins turn
 * each space on with its AdSense slot ID; Google's consent tool for every visitor). Ads appear
 * only on public pages: never on sign-in, dashboards, CV viewer, applications, messages, admin,
 * error or empty-result pages, and never beside or above an Apply button.
 */
export const AD_PAGE_TYPES = ['home', 'job_search', 'landing', 'job_detail', 'blog_post'] as const;
export type AdPageType = (typeof AD_PAGE_TYPES)[number];

export interface AdSlotDefinition {
  pageType: AdPageType;
  slotName: string;
  label: string;
  /** Reserved height in px, so the page never shifts when the ad loads (CLS). */
  height: number;
}

export const AD_SLOTS = [
  { pageType: 'home', slotName: 'below_fold', label: 'Home page: below the first screen', height: 280 },
  { pageType: 'job_search', slotName: 'in_feed', label: 'Job search (/jobs): after every 6th job', height: 250 },
  { pageType: 'landing', slotName: 'in_feed', label: 'State, LGA and subject job pages: after every 6th job', height: 250 },
  { pageType: 'job_detail', slotName: 'below_description', label: 'Job page: below the description', height: 280 },
  { pageType: 'job_detail', slotName: 'sidebar', label: 'Job page: sidebar (laptops and desktops only)', height: 600 },
  { pageType: 'blog_post', slotName: 'in_article', label: 'Blog posts: inside the article (up to 3)', height: 280 },
] as const satisfies readonly AdSlotDefinition[];

export type AdSlotName = (typeof AD_SLOTS)[number]['slotName'];
/** In-feed ads go after every 6th result (CLAUDE.md). */
export const AD_IN_FEED_EVERY = 6;
/** Blog posts carry at most 3 in-article ads (CLAUDE.md). */
export const AD_MAX_IN_ARTICLE = 3;

export function findAdSlot(pageType: string, slotName: string): AdSlotDefinition | undefined {
  return AD_SLOTS.find((s) => s.pageType === pageType && s.slotName === slotName);
}

/** PUT /admin/ads/:pageType/:slotName — a space can only be on with its AdSense slot ID. */
export const adSettingSchema = z
  .object({
    enabled: z.boolean(),
    slotId: z
      .string()
      .trim()
      .regex(/^\d{6,20}$/, 'The AdSense slot ID is the number in the ad unit code (data-ad-slot)')
      .nullable()
      .or(z.literal('').transform(() => null)),
  })
  .refine((v) => !v.enabled || !!v.slotId, { path: ['slotId'], message: 'Add the AdSense slot ID before switching this space on' });
export type AdSettingInput = z.input<typeof adSettingSchema>;

/** One space that is switched on (GET /ads/config lists only these). */
export interface AdSlotConfig {
  pageType: AdPageType;
  slotName: string;
  slotId: string;
}

export interface AdsConfigResponse {
  slots: AdSlotConfig[];
}

/** GET /admin/ads */
export interface AdminAdSlot extends AdSlotDefinition {
  enabled: boolean;
  slotId: string | null;
  updatedAt: string | null;
}
