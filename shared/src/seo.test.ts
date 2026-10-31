import { describe, expect, it } from 'vitest';
import { breadcrumbJsonLd, jobPath, jobPostingJsonLd, websiteJsonLd } from './seo';
import type { VacancyResponse } from './vacancy';

const live: VacancyResponse = {
  id: 'v1',
  slug: 'ss2-physics-teacher-ikeja',
  shortId: 'a2b3c4d5',
  title: 'SS2 Physics Teacher',
  subjects: ['physics'],
  levels: ['sss'],
  jobType: 'full_time',
  salaryMin: 150000,
  salaryMax: 220000,
  salaryCurrency: 'NGN',
  salaryPeriod: 'monthly',
  description: '<p>Teach physics.</p>',
  isAnonymous: false,
  schoolLabel: 'Greenfield Academy',
  schoolName: 'Greenfield Academy',
  schoolType: 'secondary',
  location: {
    state: { id: 's', name: 'Lagos', slug: 'lagos' },
    lga: { id: 'l', name: 'Ikeja', slug: 'ikeja' },
    area: null,
    addressLine: '5 Allen Avenue',
    lat: null,
    lng: null,
  },
  requiredQualifications: [],
  minExperienceYears: null,
  requiredCertifications: [],
  openings: 1,
  benefits: [],
  screeningQuestions: [],
  deadline: '2026-12-01',
  startDate: null,
  status: 'published',
  publishedAt: '2026-10-31T10:00:00.000Z',
  closedAt: null,
  postedBy: 'Director',
  revealed: false,
};

/**
 * Rich Results fixture: the fields Google requires (title, description, datePosted,
 * hiringOrganization, jobLocation) and recommends (validThrough, employmentType, baseSalary).
 */
describe('JobPosting JSON-LD', () => {
  it('has every required and recommended field for Google for Jobs', () => {
    const ld = jobPostingJsonLd(live, 'https://edu-forum.ng')!;
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'SS2 Physics Teacher',
      description: '<p>Teach physics.</p>',
      datePosted: '2026-10-31T10:00:00.000Z',
      validThrough: '2026-12-01T23:59:59+01:00',
      employmentType: 'FULL_TIME',
      hiringOrganization: { '@type': 'Organization', name: 'Greenfield Academy' },
      jobLocation: {
        '@type': 'Place',
        address: { '@type': 'PostalAddress', streetAddress: '5 Allen Avenue', addressLocality: 'Ikeja', addressRegion: 'Lagos', addressCountry: 'NG' },
      },
      baseSalary: { '@type': 'MonetaryAmount', currency: 'NGN', value: { '@type': 'QuantitativeValue', minValue: 150000, maxValue: 220000, unitText: 'MONTH' } },
      url: 'https://edu-forum.ng/jobs/ss2-physics-teacher-ikeja-a2b3c4d5',
    });
  });

  it('anonymous and closed jobs get no JobPosting markup', () => {
    expect(jobPostingJsonLd({ ...live, isAnonymous: true }, 'https://x')).toBeNull();
    expect(jobPostingJsonLd({ ...live, status: 'closed' }, 'https://x')).toBeNull();
  });

  it('breadcrumbs and website search action', () => {
    expect(breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Jobs', path: '/jobs' }], 'https://x').itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://x/' },
      { '@type': 'ListItem', position: 2, name: 'Jobs', item: 'https://x/jobs' },
    ]);
    expect(websiteJsonLd('https://x')).toMatchObject({ potentialAction: { target: { urlTemplate: 'https://x/jobs?q={search_term_string}' } } });
    expect(jobPath(live)).toBe('/jobs/ss2-physics-teacher-ikeja-a2b3c4d5');
  });
});
