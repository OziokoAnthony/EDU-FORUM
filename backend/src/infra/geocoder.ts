import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeocodeResult } from '@edu-forum/shared';

/**
 * Address → coordinates for GET /meta/geocode (PRD). GEOCODER_DRIVER=stub returns nothing (local);
 * "google" uses the Google Geocoding API limited to Nigeria with GOOGLE_MAPS_API_KEY.
 */
@Injectable()
export class Geocoder {
  constructor(private readonly config: ConfigService) {}

  async search(q: string, fetchImpl: typeof fetch = fetch): Promise<GeocodeResult[]> {
    const key = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (this.config.get('GEOCODER_DRIVER') !== 'google' || !key) return [];
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:NG&region=ng&key=${encodeURIComponent(key)}`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Google Geocoding ${res.status}`);
    const body = (await res.json()) as { status: string; results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[] };
    if (body.status !== 'OK') return [];
    return (body.results ?? []).slice(0, 5).map((r) => ({ lat: r.geometry.location.lat, lng: r.geometry.location.lng, label: r.formatted_address }));
  }
}

@Global()
@Module({ providers: [Geocoder], exports: [Geocoder] })
export class GeocoderModule {}
