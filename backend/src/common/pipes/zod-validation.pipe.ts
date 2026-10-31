import { HttpStatus, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ApiException } from '../filters/api-exception.filter';

/** Validates a body/query/param with a schema from @edu-forum/shared. Usage: `@Body(new ZodValidationPipe(schema))`. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
