import { randomUUID } from 'node:crypto';

import type { IncomingMessage, ServerResponse } from 'node:http';

import { REDACT_PATHS } from './redact';

export interface BuildLoggerOptionsInput {
  /** pino level: debug | info | warn | error */
  level: string;
  /** bật pino-pretty cho dev local (không dùng ở production) */
  pretty?: boolean;
  /** đường dẫn redact bổ sung theo app, cộng thêm vào REDACT_PATHS chung */
  extraRedactPaths?: string[];
}

/**
 * Cấu hình pino-http chuẩn cho mọi app (docs/05 § 5.7):
 * structured JSON, traceId từ header `x-request-id` (sinh mới nếu thiếu), redact PII.
 * Dùng với `LoggerModule.forRoot({ pinoHttp: buildPinoHttpOptions(...) })` của nestjs-pino.
 */
export function buildPinoHttpOptions(input: BuildLoggerOptionsInput) {
  return {
    level: input.level,
    redact: {
      paths: [...REDACT_PATHS, ...(input.extraRedactPaths ?? [])],
      censor: '[REDACTED]',
    },
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const fromHeader = req.headers['x-request-id'];
      const id =
        typeof fromHeader === 'string' && fromHeader.length > 0
          ? fromHeader
          : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    ...(input.pretty
      ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
      : {}),
  };
}
