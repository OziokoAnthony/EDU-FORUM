import { TopBar } from '@/components/top-bar';
import { AuthProvider } from '@/lib/auth';
import { privateMetadata } from '@/lib/private-metadata';

export const metadata = privateMetadata;

// No ads on auth pages (CLAUDE.md AdSense rules).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <TopBar />
      {children}
    </AuthProvider>
  );
}
