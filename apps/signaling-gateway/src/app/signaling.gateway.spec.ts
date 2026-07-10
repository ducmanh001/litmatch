import { SignalingGateway } from './signaling.gateway';

describe('SignalingGateway', () => {
  it('ping trả pong (smoke test skeleton — logic thật ở Giai đoạn 2)', () => {
    const gateway = new SignalingGateway();
    expect(gateway.ping()).toEqual({ event: 'pong', data: 'pong' });
  });
});
