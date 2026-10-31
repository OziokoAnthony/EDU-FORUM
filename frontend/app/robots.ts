import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/server-api';

/** CLAUDE.md: private areas are disallowed (and also noindex on the page). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/teacher',
        '/hiring',
        '/admin',
        '/login',
        '/register',
        '/verify-email',
        '/verify-phone',
        '/forgot-password',
        '/reset-password',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
