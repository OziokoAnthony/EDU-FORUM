import { APP_NAME } from './app';
import type { VacancyListItem } from './search';
import type { VacancyResponse } from './vacancy';

/** Landing pages need at least this many live jobs to be indexed (CLAUDE.md: avoid thin pages). */
export const LANDING_MIN_LIVE_JOBS = 3;
/** Closed jobs answer 410 Gone this long after closing (CLAUDE.md). */
export const GONE_AFTER_DAYS = 30;

export type SeoPageKind = 'home' | 'jobs' | 'state' | 'lga' | 'subject' | 'state_subject' | 'job';

export interface Breadcrumb {
  name: string;
  path: string;
}

/** GET /seo/meta?path= */
export interface SeoMeta {
  kind: SeoPageKind;
  path: string;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  indexable: boolean;
  breadcrumbs: Breadcrumb[];
  liveJobs: number;
  /** Slugs to filter the job list with on landing pages. */
  filters: { state?: string; lga?: string; subject?: string };
}

/** GET /seo/landing-pages */
export interface LandingPageItem {
  path: string;
  kind: 'state' | 'lga' | 'subject' | 'state_subject';
  label: string;
  liveJobs: number;
  lastmod: string;
}

/** GET /vacancies/by-slug/:slug (public job page). */
export interface JobPageResponse {
  vacancy: VacancyResponse;
  /** Up to 5 live jobs in the same state with a subject in common (internal links). */
  similar: VacancyListItem[];
  canonicalPath: string;
  breadcrumbs: Breadcrumb[];
}

export interface SitemapEntry {
  path: string;
  lastmod: string;
}

/** `/jobs/{slug}-{shortId}` */
export function jobPath(v: { slug: string; shortId: string }): string {
  return `/jobs/${v.slug}-${v.shortId}`;
}

const EMPLOYMENT_TYPE = { full_time: 'FULL_TIME', part_time: 'PART_TIME', contract: 'CONTRACTOR', tutoring: 'PART_TIME' } as const;
const SALARY_UNIT = { monthly: 'MONTH', annual: 'YEAR', hourly: 'HOUR' } as const;

/**
 * Google `JobPosting` structured data for a live job. Returns null for anonymous or
 * non-live vacancies: anonymous jobs get no JobPosting (confirmed 2026-10-31), and closed
 * jobs must drop the markup (CLAUDE.md).
 */
export function jobPostingJsonLd(v: VacancyResponse, siteUrl: string): Record<string, unknown> | null {
  if (v.isAnonymous || v.status !== 'published' || !v.schoolName || !v.publishedAt) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: v.title,
    description: v.description,
    datePosted: v.publishedAt,
    ...(v.deadline ? { validThrough: `${v.deadline}T23:59:59+01:00` } : {}),
    employmentType: EMPLOYMENT_TYPE[v.jobType],
    hiringOrganization: { '@type': 'Organization', name: v.schoolName },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(v.location.addressLine ? { streetAddress: v.location.addressLine } : {}),
        addressLocality: v.location.lga.name,
        addressRegion: v.location.state.name,
        addressCountry: 'NG',
      },
    },
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'NGN',
      value: { '@type': 'QuantitativeValue', minValue: v.salaryMin, maxValue: v.salaryMax, unitText: SALARY_UNIT[v.salaryPeriod] },
    },
    directApply: true,
    url: `${siteUrl}${jobPath(v)}`,
  };
}

export function breadcrumbJsonLd(crumbs: Breadcrumb[], siteUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${siteUrl}${c.path}` })),
  };
}

export function websiteJsonLd(siteUrl: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_NAME,
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/jobs?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}
