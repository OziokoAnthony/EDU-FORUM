import type { Metadata, Viewport } from 'next';
import { Oswald } from 'next/font/google';
import { APP_NAME } from '@edu-forum/shared';
import { Providers } from './providers';
import './globals.css';

/** Condensed capitals for headings; downloaded at build time and served from our own domain. */
const oswald = Oswald({ subsets: ['latin'], weight: ['400', '500'], display: 'swap', variable: '--font-oswald' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1d1f22',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={oswald.variable}>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
