import { describe, expect, it } from 'vitest';
import { identifierSchema, passwordSchema, phoneSchema, registerSchema } from './auth';

describe('phoneSchema', () => {
  it.each(['08031234567', '2348031234567', '+234 803 123 4567', '0703-123-4567'])(
    'normalises %s',
    (input) => {
      expect(phoneSchema.parse(input)).toMatch(/^\+234[789][01]\d{8}$/);
    },
  );

  it('rejects non-Nigerian or short numbers', () => {
    expect(phoneSchema.safeParse('0803123').success).toBe(false);
    expect(phoneSchema.safeParse('+447911123456').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('needs 8+ chars with a letter and a number', () => {
    expect(passwordSchema.safeParse('abc12345').success).toBe(true);
    expect(passwordSchema.safeParse('abcdefgh').success).toBe(false);
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
  });
});

describe('registerSchema', () => {
  const base = { password: 'teach2026', role: 'teacher', consent: true } as const;

  it('requires an email or phone', () => {
    expect(registerSchema.safeParse(base).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, email: 'A@B.com' }).data?.email).toBe('a@b.com');
  });

  it('requires consent', () => {
    expect(registerSchema.safeParse({ ...base, email: 'a@b.com', consent: false }).success).toBe(false);
  });
});

describe('identifierSchema', () => {
  it('detects email vs phone', () => {
    expect(identifierSchema.parse('Ada@Example.com')).toEqual({ kind: 'email', value: 'ada@example.com' });
    expect(identifierSchema.parse('08031234567')).toEqual({ kind: 'phone', value: '+2348031234567' });
  });
});
