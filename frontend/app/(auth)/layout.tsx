import { SiteBanner } from '@/components/site-banner';
import { AuthProvider } from '@/lib/auth';
import { privateMetadata } from '@/lib/private-metadata';

export const metadata = privateMetadata;

// No ads on auth pages (CLAUDE.md AdSense rules).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <header className="mx-auto max-w-6xl sm:px-4">
        <SiteBanner compact />
      </header>
      {children}
    </AuthProvider>
  );
}
