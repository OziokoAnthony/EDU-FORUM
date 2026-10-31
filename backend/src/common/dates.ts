/** "YYYY-MM-DD" ⇄ Postgres DATE (Prisma gives a Date at UTC midnight). */
export function toDbDate(value: string): Date;
export function toDbDate(value: string | null | undefined): Date | null | undefined;
export function toDbDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(`${value}T00:00:00Z`);
}

export function fromDbDate(value: Date): string;
export function fromDbDate(value: Date | null): string | null;
export function fromDbDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
