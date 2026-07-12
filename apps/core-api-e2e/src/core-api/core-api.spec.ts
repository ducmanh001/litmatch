import axios from 'axios';

describe('GET /health', () => {
  it('returns the core-api liveness envelope', async () => {
    const res = await axios.get('/health');

    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      data: {
        status: 'ok',
        uptimeSeconds: expect.any(Number),
      },
    });
  });

  it('separates liveness from dependency readiness', async () => {
    const live = await axios.get('/health/live');
    const ready = await axios.get('/health/ready');

    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(ready.data).toEqual({
      data: {
        status: 'ok',
        checks: { postgres: 'up', redis: 'up' },
      },
    });
  });
});
