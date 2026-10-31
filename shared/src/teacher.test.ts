import { describe, expect, it } from 'vitest';
import {
  certificationSchema,
  computeCompleteness,
  COMPLETENESS_ITEMS,
  experienceSchema,
  locationSchema,
  personalSchema,
  preferencesSchema,
} from './teacher';
import { MAX_UPLOAD_BYTES, signUploadSchema } from './uploads';

const uuid = '00000000-0000-4000-8000-000000000000';

describe('completeness', () => {
  it('weights add up to 100, with the required items worth 85', () => {
    expect(COMPLETENESS_ITEMS.reduce((s, i) => s + i.weight, 0)).toBe(100);
    expect(COMPLETENESS_ITEMS.filter((i) => i.required).reduce((s, i) => s + i.weight, 0)).toBe(85);
  });

  it('lists missing required items and only allows publishing when none are missing', () => {
    const none = computeCompleteness({});
    expect(none).toMatchObject({ score: 0, canPublish: false });
    expect(none.missing).toEqual(['cv', 'qualification', 'experience', 'preferences', 'location', 'personal']);

    const required = computeCompleteness({ cv: true, qualification: true, experience: true, preferences: true, location: true, personal: true });
    expect(required).toMatchObject({ score: 85, missing: [], canPublish: true });

    const extras = computeCompleteness({ photo: true, bio: true });
    expect(extras).toMatchObject({ score: 15, canPublish: false });
  });
});

describe('uploads', () => {
  const sign = (o: object) => signUploadSchema.safeParse({ purpose: 'cv', fileName: 'cv.pdf', mimeType: 'application/pdf', sizeBytes: 100, ...o });

  it('accepts PDF, DOC and DOCX CVs up to 5 MB', () => {
    expect(sign({}).success).toBe(true);
    expect(sign({ fileName: 'CV.DOC', mimeType: 'application/msword' }).success).toBe(true);
    expect(sign({ fileName: 'cv.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }).success).toBe(true);
    expect(sign({ sizeBytes: MAX_UPLOAD_BYTES }).success).toBe(true);
    expect(sign({ sizeBytes: MAX_UPLOAD_BYTES + 1 }).success).toBe(false);
    expect(sign({ sizeBytes: 0 }).success).toBe(false);
  });

  it('rejects other types and extensions that do not match the MIME type', () => {
    expect(sign({ fileName: 'cv.txt', mimeType: 'text/plain' }).success).toBe(false);
    expect(sign({ fileName: 'cv.docx' }).success).toBe(false);
    expect(sign({ purpose: 'profile_photo', fileName: 'me.jpeg', mimeType: 'image/jpeg' }).success).toBe(true);
    expect(sign({ purpose: 'profile_photo' }).success).toBe(false);
  });
});

describe('wizard step schemas', () => {
  it('personal: date of birth cannot be in the future', () => {
    expect(personalSchema.safeParse({ fullName: 'Ada Okafor', gender: 'female', dob: '1994-05-12' }).success).toBe(true);
    expect(personalSchema.safeParse({ fullName: 'Ada Okafor', gender: 'female', dob: '2999-01-01' }).success).toBe(false);
  });

  it('location: state and LGA required; map pin needs both coordinates', () => {
    expect(locationSchema.safeParse({ stateId: uuid, lgaId: uuid }).success).toBe(true);
    expect(locationSchema.safeParse({ stateId: uuid }).success).toBe(false);
    expect(locationSchema.safeParse({ stateId: uuid, lgaId: uuid, lat: 6.5 }).success).toBe(false);
    expect(locationSchema.safeParse({ stateId: uuid, lgaId: uuid, lat: 6.5, lng: 3.3 }).success).toBe(true);
  });

  it('experience: end date or "current", never both', () => {
    const base = { schoolName: 'Kings College', role: 'Teacher', startDate: '2018-01-01' };
    expect(experienceSchema.safeParse({ ...base, endDate: '2020-01-01' }).success).toBe(true);
    expect(experienceSchema.safeParse({ ...base, isCurrent: true }).success).toBe(true);
    expect(experienceSchema.safeParse(base).success).toBe(false);
    expect(experienceSchema.safeParse({ ...base, isCurrent: true, endDate: '2020-01-01' }).success).toBe(false);
    expect(experienceSchema.safeParse({ ...base, endDate: '2017-01-01' }).success).toBe(false);
  });

  it('preferences: at least one subject, level and job type; salary min <= max', () => {
    const base = { subjects: ['mathematics'], levels: ['sss'], jobTypes: ['full_time'] };
    expect(preferencesSchema.safeParse(base).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...base, subjects: [] }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, expectedSalaryMin: 2, expectedSalaryMax: 1 }).success).toBe(false);
  });

  it('certification: needs a file; expiry after issue', () => {
    const base = { certificationTypeId: uuid, issuer: 'TRCN', number: 'X1', issuedAt: '2020-01-01', fileUploadId: uuid };
    expect(certificationSchema.safeParse(base).success).toBe(true);
    expect(certificationSchema.safeParse({ ...base, fileUploadId: undefined }).success).toBe(false);
    expect(certificationSchema.safeParse({ ...base, expiresAt: '2019-01-01' }).success).toBe(false);
  });
});
