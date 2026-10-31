import { z } from 'zod';

/** GET /meta/* reference lists. */
export interface MetaItem {
  id: string;
  name: string;
  slug: string;
}

export interface QualificationTypeItem extends MetaItem {
  rank: number;
}

export interface CertificationTypeItem extends MetaItem {
  issuer: string | null;
}

export interface CountryItem {
  code: string;
  name: string;
}

export interface StateItem extends MetaItem {
  countryCode: string;
}

export interface LgaItem extends MetaItem {
  stateId: string;
}

export interface ListResponse<T> {
  data: T[];
}

export const statesQuerySchema = z.object({ country: z.string().trim().toUpperCase().length(2).default('NG') });

/** `?state=` accepts the state's slug or id. */
export const lgasQuerySchema = z.object({ state: z.string().trim().min(1, 'state is required') });

export const geocodeQuerySchema = z.object({ q: z.string().trim().min(3, 'Enter an address').max(200) });

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}
