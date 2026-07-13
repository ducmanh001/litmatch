import axios from 'axios';

describe('GET /health', () => {
  it('returns the signaling-gateway liveness response', async () => {
    const res = await axios.get('/health');

    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      status: 'ok',
      uptimeSeconds: expect.any(Number),
    });
  });

  it('exposes separate liveness and readiness probes', async () => {
    const live = await axios.get('/health/live');
    const ready = await axios.get('/health/ready');

    expect(live.status).toBe(200);
    expect(ready.data).toEqual({
      status: 'ok',
      checks: { redisSubscription: 'up', redisClusterAdapter: 'up' },
    });
  });
});
