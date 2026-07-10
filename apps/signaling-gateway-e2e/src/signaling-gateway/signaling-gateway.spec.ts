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
});
