import type { Metadata } from 'next';
import Image from 'next/image';
import logoIcon from '@/public/brand/logo-icon.png';
import { RetryButton } from './retry';

export const metadata: Metadata = { title: 'You are offline', robots: { index: false, follow: false } };

/** Shown by the service worker when there is no network and the page is not saved. */
export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Image src={logoIcon} alt="" width={96} height={96} priority />
      <h1 className="text-2xl text-slate-900">You are offline</h1>
      <p className="text-slate-600">Check your mobile data or Wi-Fi. Pages you opened recently still work; everything else will load when you are back online.</p>
      <RetryButton />
    </main>
  );
}
