import Image from 'next/image';
import Link from 'next/link';
import { APP_NAME } from '@edu-forum/shared';
import banner from '@/public/images/stock/banner.jpg';

/**
 * The photo banner across the top of every page (zone94-style portal header), with the
 * EDU-FORUM logo over it. `compact` is the slim strip used on sign-in and dashboards.
 */
export function SiteBanner({ compact = false, children }: { compact?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-b-md border-x border-b border-slate-200 ${compact ? 'h-16' : 'h-32 sm:h-40'}`}>
      <Image
        src={banner}
        alt=""
        fill
        priority
        sizes="(min-width: 1200px) 1200px, 100vw"
        placeholder="blur"
        className="object-cover object-[50%_62%]"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
      <div className="relative flex h-full items-center justify-between gap-3 px-4">
        <Link href="/" className="font-heading leading-none tracking-[0.08em] text-gold drop-shadow">
          <span className={`block uppercase ${compact ? 'text-2xl' : 'text-4xl sm:text-5xl'}`}>{APP_NAME}</span>
          {compact ? null : <span className="mt-1 block text-xs tracking-[0.3em] text-slate-800 sm:text-sm">TEACHERS · PRINCIPALS · DIRECTORS</span>}
        </Link>
        {children}
      </div>
    </div>
  );
}
