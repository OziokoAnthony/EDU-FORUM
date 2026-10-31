import { PrivateShell } from '@/components/private-shell';
import { privateMetadata } from '@/lib/private-metadata';

export const metadata = privateMetadata;

// Private area: noindex, no ads (CLAUDE.md).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PrivateShell roles={['school_owner', 'recruiter']}>{children}</PrivateShell>;
}
