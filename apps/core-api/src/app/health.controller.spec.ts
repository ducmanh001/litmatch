import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';

import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';

describe('HealthController', () => {
  const readiness = { check: jest.fn() };
  const response = { status: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('keeps liveness independent from dependencies', () => {
    const controller = new HealthController(readiness as never);

    expect(controller.live()).toEqual({
      status: 'ok',
      uptimeSeconds: expect.any(Number),
    });
    expect(readiness.check).not.toHaveBeenCalled();
  });

  it('returns 503 when a required dependency is unavailable', async () => {
    readiness.check.mockResolvedValue({
      status: 'unavailable',
      checks: { postgres: 'down', redis: 'up' },
    });
    const controller = new HealthController(readiness as never);

    await expect(controller.ready(response as never)).resolves.toEqual({
      status: 'unavailable',
      checks: { postgres: 'down', redis: 'up' },
    });
    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });
});

@Controller('limited')
class LimitedController {
  @Get() get() {
    return { ok: true };
  }
}
// Both apps deliberately share storage, matching the production cross-pod counter contract.
const sharedStorage = new ThrottlerStorageService();
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 1 }],
      storage: sharedStorage,
    }),
  ],
  controllers: [HealthController, LimitedController],
  providers: [
    {
      provide: ReadinessService,
      useValue: {
        check: async () => ({
          status: 'ok',
          checks: { postgres: 'up', redis: 'up' },
        }),
      },
    },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
class ProbeTestModule {}

describe('readiness probes across replicas (real Nest HTTP)', () => {
  let apps: INestApplication[];
  beforeAll(async () => {
    apps = await Promise.all(
      [0, 1].map(async () => {
        const app = await NestFactory.create(ProbeTestModule, {
          logger: false,
        });
        await app.init();
        return app;
      }),
    );
  });
  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('keeps probes available under a shared quota while ordinary routes remain throttled', async () => {
    await request(apps[0].getHttpServer()).get('/limited').expect(200);
    await request(apps[1].getHttpServer()).get('/limited').expect(429);
    for (let i = 0; i < 40; i++) {
      await request(apps[i % 2].getHttpServer())
        .get('/health/ready')
        .expect(200);
    }
  });
});
