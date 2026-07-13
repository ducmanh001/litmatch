import { IoAdapter } from '@nestjs/platform-socket.io';

import { CorsIoAdapter } from './cors-io.adapter';

import type { INestApplicationContext } from '@nestjs/common';

const fakeApp = {} as unknown as INestApplicationContext;

describe('CorsIoAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gộp cors allow-list + cluster adapter (Redis, docs/07 GĐ6) vào ServerOptions', () => {
    const superSpy = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue({} as never);
    const clusterAdapter = jest.fn() as never;

    const adapter = new CorsIoAdapter(
      fakeApp,
      ['https://a.example'],
      clusterAdapter,
    );
    adapter.createIOServer(0, { path: '/x' });

    expect(superSpy).toHaveBeenCalledWith(0, {
      path: '/x',
      cors: { origin: ['https://a.example'] },
      adapter: clusterAdapter,
    });
  });

  it('không origin nào → cors.origin=false; không truyền clusterAdapter → không có key adapter', () => {
    const superSpy = jest
      .spyOn(IoAdapter.prototype, 'createIOServer')
      .mockReturnValue({} as never);

    const adapter = new CorsIoAdapter(fakeApp, []);
    adapter.createIOServer(0);

    expect(superSpy).toHaveBeenCalledWith(0, { cors: { origin: false } });
  });
});
