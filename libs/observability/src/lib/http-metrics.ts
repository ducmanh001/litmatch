import { Histogram } from 'prom-client';

import type { NextFunction, Request, Response } from 'express';
import type { Registry } from 'prom-client';

const DEFAULT_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/**
 * Middleware Express đo `http_request_duration_seconds` (docs/07 Giai đoạn 6) — dùng chung
 * cho core-api + signaling-gateway. Nhãn `route` lấy từ `req.route.path` (pattern đã đăng ký,
 * vd `/matching/tickets/:id`) thay vì `req.path` (giá trị thật) để tránh nổ số cardinality
 * theo từng id — nếu Express chưa resolve được route (404, middleware global) thì fallback 'unmatched'.
 */
export function createHttpMetricsMiddleware(
  registry: Registry,
): (req: Request, res: Response, next: NextFunction) => void {
  const histogram = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Thời gian xử lý HTTP request tính bằng giây, theo method/route/status_code',
    labelNames: ['method', 'route', 'status_code'],
    buckets: DEFAULT_BUCKETS_SECONDS,
    registers: [registry],
  });

  return function httpMetricsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const endTimer = histogram.startTimer();
    res.on('finish', () => {
      endTimer({
        method: req.method,
        route: req.route?.path ? String(req.route.path) : 'unmatched',
        status_code: String(res.statusCode),
      });
    });
    next();
  };
}
