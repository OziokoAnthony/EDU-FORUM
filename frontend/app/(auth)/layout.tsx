import Link from 'next/link';
import { APP_NAME } from '@edu-forum/shared';
import { AuthProvider } from '@/lib/auth';
import { privateMetadata } from '@/lib/private-metadata';

export const metadata = privateMetadata;

// No ads on auth pages (CLAUDE.md AdSense rules).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <header className="border-b border-slate-200 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-emerald-800">
          {APP_NAME}
        </Link>
      </header>
      {children}
    </AuthProvider>
  );
}
