import { Controller, Get, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR, NestFactory, Reflector } from '@nestjs/core';
import { Subject, firstValueFrom, of, throwError } from 'rxjs';
import request from 'supertest';

import {
  RequestConcurrencyInterceptor,
  SkipRequestConcurrency,
} from './request-concurrency.interceptor';
import type { ExecutionContext, INestApplication } from '@nestjs/common';

const config = {
  getOrThrow: (key: string) => (key === 'HTTP_MAX_CONCURRENT_REQUESTS' ? 1 : 5),
};
function context() {
  const setHeader = jest.fn();
  return {
    setHeader,
    value: {
      getType: () => 'http',
      getClass: () => class {},
      getHandler: () =>
        function handler() {
          return undefined;
        },
      switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
    } as unknown as ExecutionContext,
  };
}

describe('RequestConcurrencyInterceptor slot lifecycle', () => {
  it('rejects excess work and releases slots on unsubscribe, error and synchronous failure', async () => {
    const limiter = new RequestConcurrencyInterceptor(
      config as never,
      new Reflector(),
    );
    const ctx = context();
    const pending = new Subject();
    const running = limiter
      .intercept(ctx.value, { handle: () => pending })
      .subscribe();
    const work = jest.fn(() => of('ok'));
    await expect(
      firstValueFrom(limiter.intercept(ctx.value, { handle: work })),
    ).rejects.toMatchObject({ status: 503 });
    expect(work).not.toHaveBeenCalled();
    expect(ctx.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    running.unsubscribe();
    await expect(
      firstValueFrom(
        limiter.intercept(ctx.value, {
          handle: () => throwError(() => new Error('async')),
        }),
      ),
    ).rejects.toThrow('async');
    await expect(
      firstValueFrom(
        limiter.intercept(ctx.value, {
          handle: () => {
            throw new Error('sync');
          },
        }),
      ),
    ).rejects.toThrow('sync');
    await expect(
      firstValueFrom(limiter.intercept(ctx.value, { handle: work })),
    ).resolves.toBe('ok');
  });

  it('does not reserve a slot until the response Observable is subscribed', async () => {
    const limiter = new RequestConcurrencyInterceptor(
      config as never,
      new Reflector(),
    );
    const ctx = context();
    limiter.intercept(ctx.value, { handle: () => new Subject() });
    await expect(
      firstValueFrom(limiter.intercept(ctx.value, { handle: () => of('ok') })),
    ).resolves.toBe('ok');
  });
});

@Controller('work')
class WorkController {
  started!: () => void;
  release!: () => void;
  entered = new Promise<void>((resolve) => {
    this.started = resolve;
  });
  gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  @Get('hold') async hold() {
    this.started();
    await this.gate;
    return { ok: true };
  }
  @Get('fast') fast() {
    return { ok: true };
  }
}
@Controller('probe')
@SkipRequestConcurrency()
class ProbeController {
  @Get() live() {
    return { ok: true };
  }
}
@Module({
  controllers: [WorkController, ProbeController],
  providers: [
    { provide: ConfigService, useValue: config },
    { provide: APP_INTERCEPTOR, useClass: RequestConcurrencyInterceptor },
  ],
})
class ConcurrencyTestModule {}

describe('HTTP request admission (real Nest HTTP server)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await NestFactory.create(ConcurrencyTestModule, { logger: false });
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('sheds overload with 503, keeps probes working, then serves new requests after completion', async () => {
    const controller = app.get(WorkController);
    const holding = request(app.getHttpServer())
      .get('/work/hold')
      .then((response) => response);
    await controller.entered;
    try {
      await request(app.getHttpServer())
        .get('/work/fast')
        .expect(503)
        .expect('Retry-After', '1');
      await request(app.getHttpServer()).get('/probe').expect(200);
    } finally {
      controller.release();
      await holding;
    }
    await request(app.getHttpServer()).get('/work/fast').expect(200);
  });
});
