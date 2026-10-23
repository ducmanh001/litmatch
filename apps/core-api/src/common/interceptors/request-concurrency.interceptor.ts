import {
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { defer, finalize } from 'rxjs';

import { ConcurrencyBudget } from '../scheduling/concurrency-budget';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { CoreApiEnv } from '../../config/env.validation';

const SKIP_REQUEST_CONCURRENCY = Symbol('skip-request-concurrency');
export const SkipRequestConcurrency = () =>
  SetMetadata(SKIP_REQUEST_CONCURRENCY, true);

/** Bounded admission, not another request queue. PostgreSQL keeps its own connection/query limits. */
@Injectable()
export class RequestConcurrencyInterceptor implements NestInterceptor {
  private readonly budget: ConcurrencyBudget;

  constructor(
    config: ConfigService<CoreApiEnv, true>,
    private readonly reflector: Reflector,
  ) {
    const configured = config.getOrThrow('HTTP_MAX_CONCURRENT_REQUESTS', {
      infer: true,
    });
    this.budget = new ConcurrencyBudget(
      configured || config.getOrThrow('DATABASE_POOL_MAX', { infer: true }) * 4,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler) {
    if (
      context.getType() !== 'http' ||
      this.reflector.getAllAndOverride<boolean>(SKIP_REQUEST_CONCURRENCY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return next.handle();

    return defer(() => {
      const release = this.budget.tryAcquire();
      if (!release) {
        context
          .switchToHttp()
          .getResponse<Response>()
          .setHeader('Retry-After', '1');
        throw new ServiceUnavailableException(
          'Dịch vụ đang bận, vui lòng thử lại sau.',
        );
      }
      // Inner defer also releases the slot when handle() throws before returning an Observable.
      return defer(() => next.handle()).pipe(finalize(release));
    });
  }
}
