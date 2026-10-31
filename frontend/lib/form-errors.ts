import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/** Puts API field errors on the form fields; returns a message for anything else. */
export function applyApiError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): string | null {
  if (!(err instanceof ApiError)) return 'Could not reach EDU-FORUM. Check your connection and try again.';
  const fields = err.fieldErrors();
  for (const [path, message] of Object.entries(fields)) setError(path as Path<T>, { message });
  if (Object.keys(fields).length > 0 && err.body.message === 'Validation failed') return null;
  if (err.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return err.body.message;
}
