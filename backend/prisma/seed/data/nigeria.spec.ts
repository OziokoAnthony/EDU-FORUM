import { slugify } from '@edu-forum/shared';
import { NIGERIA_STATES } from './nigeria';

// Official LGA counts per state (774 total).
const EXPECTED: Record<string, number> = {
  Abia: 17, Adamawa: 21, 'Akwa Ibom': 31, Anambra: 21, Bauchi: 20, Bayelsa: 8, Benue: 23,
  Borno: 27, 'Cross River': 18, Delta: 25, Ebonyi: 13, Edo: 18, Ekiti: 16, Enugu: 17,
  'Federal Capital Territory': 6, Gombe: 11, Imo: 27, Jigawa: 27, Kaduna: 23, Kano: 44,
  Katsina: 34, Kebbi: 21, Kogi: 21, Kwara: 16, Lagos: 20, Nasarawa: 13, Niger: 25, Ogun: 20,
  Ondo: 18, Osun: 30, Oyo: 33, Plateau: 17, Rivers: 23, Sokoto: 23, Taraba: 16, Yobe: 17,
  Zamfara: 14,
};

describe('Nigeria seed data', () => {
  it('has 36 states + FCT', () => {
    expect(Object.keys(NIGERIA_STATES).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s has %i LGAs', (state, count) => {
    expect(NIGERIA_STATES[state]).toHaveLength(count);
  });

  it('has 774 LGAs in total', () => {
    expect(Object.values(NIGERIA_STATES).flat()).toHaveLength(774);
  });

  it('has unique LGA slugs within each state', () => {
    for (const lgas of Object.values(NIGERIA_STATES)) {
      const slugs = lgas.map(slugify);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});
