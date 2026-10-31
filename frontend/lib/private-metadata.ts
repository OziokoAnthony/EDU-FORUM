import type { Metadata } from 'next';

/** Private pages (auth, onboarding, dashboards, admin) are never indexed (CLAUDE.md SEO rules). */
export const privateMetadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};
