import { findAdSlot, type AdPageType } from '@edu-forum/shared';
import { ADSENSE_CLIENT, getAdsConfig } from '@/lib/ads';
import { AdUnit } from './ad-unit';

/**
 * The one ad component (CLAUDE.md): `<AdSlot pageType slot />`. Server-rendered, so a space that
 * is off (or no publisher ID yet) renders nothing at all; a space that is on reserves its full
 * height before the ad arrives (no layout shift) and loads only when scrolled near.
 */
export async function AdSlot({ pageType, slot, className = '', listItem = false }: { pageType: AdPageType; slot: string; className?: string; listItem?: boolean }) {
  const def = findAdSlot(pageType, slot);
  if (!def || !ADSENSE_CLIENT) return null;
  const on = (await getAdsConfig()).slots.find((s) => s.pageType === pageType && s.slotName === slot);
  if (!on) return null;
  const ad = (
    <aside aria-label="Advertisement" className={className}>
      <p className="mb-1 text-center text-[11px] uppercase tracking-wide text-slate-400">Advertisement</p>
      <div style={{ minHeight: def.height }} className="overflow-hidden">
        <AdUnit client={ADSENSE_CLIENT} slotId={on.slotId} height={def.height} />
      </div>
    </aside>
  );
  return listItem ? <li className="list-none">{ad}</li> : ad;
}
