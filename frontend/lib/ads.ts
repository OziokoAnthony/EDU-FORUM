import type { AdsConfigResponse } from '@edu-forum/shared';
import { serverGet } from './server-api';

/** AdSense publisher ID (ca-pub-…). Empty until the account exists: no script, no ads. */
export const ADSENSE_CLIENT = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '').trim();

/** Spaces switched on by an admin (cached; refreshed when an admin changes them). */
export async function getAdsConfig(): Promise<AdsConfigResponse> {
  if (!ADSENSE_CLIENT) return { slots: [] };
  return (await serverGet<AdsConfigResponse>('/ads/config', ['ads'])).data ?? { slots: [] };
}
