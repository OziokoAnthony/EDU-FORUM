import type { Metadata, Viewport } from 'next';
import { APP_NAME } from '@edu-forum/shared';
import { RegisterServiceWorker } from '@/components/pwa/register-sw';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  // Installed app on iPhone: full screen with our name under the icon.
  appleWebApp: { capable: true, title: 'eduforum', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
