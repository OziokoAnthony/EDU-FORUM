import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody, ErrorCode } from '@edu-forum/shared';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.GONE]: 'GONE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'BUSINESS_RULE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

// Nest's built-in bodies also have an `error` key, but as a string ("Not Found").
function isApiErrorBody(body: unknown): body is ApiErrorBody {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === 'object' && error !== null && 'code' in error;
}

/** Throw this to control the error code and details exactly. */
export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: ErrorCode, message: string, details?: unknown) {
    super({ error: { code, message, details } } satisfies ApiErrorBody, status);
  }
}

/** Renders every error as `{ error: { code, message, details? } }`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (isApiErrorBody(body)) {
        res.status(status).json(body);
        return;
      }
      const message =
        typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      res.status(status).json({
        error: { code: CODE_BY_STATUS[status] ?? 'INTERNAL_ERROR', message: String(message) },
      } satisfies ApiErrorBody);
      return;
    }

    this.logger.error(exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    } satisfies ApiErrorBody);
  }
}
