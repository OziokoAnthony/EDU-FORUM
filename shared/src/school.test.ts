import { describe, expect, it } from 'vitest';
import { contactSchema, createSchoolSchema, schoolLocationSchema, updateSchoolSchema } from './school';

const uuid = '00000000-0000-4000-8000-000000000000';
const details = { name: 'Greenfield Academy', type: 'secondary', ownership: 'private', curriculum: ['nigerian', 'british'] };

describe('school schemas', () => {
  it('details: several curricula allowed, at least one required; website gets https://', () => {
    expect(createSchoolSchema.parse({ ...details, website: 'greenfield.edu.ng' }).website).toBe('https://greenfield.edu.ng');
    expect(createSchoolSchema.safeParse({ ...details, curriculum: [] }).success).toBe(false);
    expect(createSchoolSchema.safeParse({ ...details, curriculum: ['klingon'] }).success).toBe(false);
    expect(createSchoolSchema.safeParse({ ...details, website: 'not a url' }).success).toBe(false);
  });

  it('contact person: Nigerian phone normalised, email lower-cased', () => {
    const c = contactSchema.parse({ contactName: 'Mrs Bisi', contactTitle: 'principal', contactPhone: '0803 123 4567', contactEmail: 'A@B.NG' });
    expect(c).toMatchObject({ contactPhone: '+2348031234567', contactEmail: 'a@b.ng' });
    expect(contactSchema.safeParse({ ...c, contactTitle: 'janitor' }).success).toBe(false);
  });

  it('location: full address required', () => {
    expect(schoolLocationSchema.safeParse({ stateId: uuid, lgaId: uuid }).success).toBe(false);
    expect(schoolLocationSchema.safeParse({ stateId: uuid, lgaId: uuid, addressLine: '12 Admiralty Way' }).success).toBe(true);
  });

  it('update: needs at least one field', () => {
    expect(updateSchoolSchema.safeParse({}).success).toBe(false);
    expect(updateSchoolSchema.safeParse({ name: 'New Name' }).success).toBe(true);
  });
});
