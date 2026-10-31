/**
 * Starting reference lists. Admins manage them afterwards via /admin/meta/:type,
 * so these are a sensible default, not a fixed list.
 */

/** PRD FR-2: nursery, primary, JSS, SSS, tertiary. */
export const LEVELS = ['Nursery', 'Primary', 'JSS', 'SSS', 'Tertiary'];

/** Common subjects across the Nigerian nursery, primary, JSS and SSS curricula. */
export const SUBJECTS = [
  'English Language',
  'Mathematics',
  'Further Mathematics',
  'Basic Science',
  'Basic Technology',
  'Physics',
  'Chemistry',
  'Biology',
  'Agricultural Science',
  'Computer Studies',
  'Data Processing',
  'Economics',
  'Commerce',
  'Financial Accounting',
  'Business Studies',
  'Marketing',
  'Office Practice',
  'Government',
  'Civic Education',
  'Social Studies',
  'Geography',
  'History',
  'Literature in English',
  'Christian Religious Studies',
  'Islamic Religious Studies',
  'Yoruba',
  'Igbo',
  'Hausa',
  'French',
  'Arabic',
  'Cultural and Creative Arts',
  'Fine Arts',
  'Music',
  'Home Economics',
  'Food and Nutrition',
  'Physical and Health Education',
  'Technical Drawing',
  'Phonics',
  'Quantitative Reasoning',
  'Verbal Reasoning',
  'Early Years Education',
  'Special Needs Education',
];

/** PRD examples (NCE, B.Ed, B.Sc + PGDE, M.Ed) plus common equivalents; rank orders "highest". */
export const QUALIFICATION_TYPES: { name: string; rank: number }[] = [
  { name: 'OND', rank: 10 },
  { name: 'NCE', rank: 20 },
  { name: 'HND', rank: 30 },
  { name: 'B.A.', rank: 40 },
  { name: 'B.Sc.', rank: 40 },
  { name: 'B.Tech.', rank: 40 },
  { name: 'B.Ed.', rank: 45 },
  { name: 'B.A. (Ed.)', rank: 45 },
  { name: 'B.Sc. (Ed.)', rank: 45 },
  { name: 'PGDE', rank: 50 },
  { name: 'M.A.', rank: 60 },
  { name: 'M.Sc.', rank: 60 },
  { name: 'M.Ed.', rank: 65 },
  { name: 'Ph.D.', rank: 80 },
];

/** PRD FR-2 names TRCN; others are "other professional certificates" with issuer/number/dates. */
export const CERTIFICATION_TYPES: { name: string; issuer?: string }[] = [
  { name: 'TRCN Registration', issuer: 'Teachers Registration Council of Nigeria' },
  { name: 'Montessori Teaching Certificate' },
  { name: 'TESOL / TEFL Certificate' },
  { name: 'Other Professional Certificate' },
];

/** PRD ad placements; every slot starts disabled until AdSense is approved (Phase 12). */
export const AD_SLOTS: { pageType: 'home' | 'job_search' | 'landing' | 'job_detail' | 'blog_post'; slotName: string }[] = [
  { pageType: 'home', slotName: 'below_fold' },
  { pageType: 'job_search', slotName: 'in_feed' },
  { pageType: 'job_search', slotName: 'sidebar' },
  { pageType: 'landing', slotName: 'in_feed' },
  { pageType: 'landing', slotName: 'sidebar' },
  { pageType: 'job_detail', slotName: 'below_description' },
  { pageType: 'job_detail', slotName: 'sidebar' },
  { pageType: 'blog_post', slotName: 'in_article' },
];
