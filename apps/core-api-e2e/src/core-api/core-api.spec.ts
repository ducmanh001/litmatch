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
});
