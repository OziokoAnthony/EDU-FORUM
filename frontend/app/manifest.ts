import type { MetadataRoute } from 'next';
import { APP_NAME } from '@edu-forum/shared';

/** Installable app (PWA, user 2026-11-01): home-screen icon, opens full screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME}: teaching jobs and community`,
    short_name: 'eduforum',
    description: 'Find teaching jobs, recruit teachers and connect with educators across Nigeria.',
    id: '/',
    start_url: '/?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'en-NG',
    categories: ['education', 'business'],
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Find teaching jobs', url: '/jobs', icons: [{ src: '/brand/icon-192.png', sizes: '192x192' }] },
      { name: 'Sign in', url: '/login', icons: [{ src: '/brand/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
