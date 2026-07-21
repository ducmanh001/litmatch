import { getGoogleIdToken } from './google-identity';

describe('getGoogleIdToken', () => {
  it('tải SDK một lần và trả credential từ callback Google', async () => {
    const appendChild = vi
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node) => {
        const script = node as HTMLScriptElement;
        window.setTimeout(() => script.onload?.(new Event('load')), 0);
        return node;
      });
    const initialize = vi.fn(
      (config: { callback: (response: { credential: string }) => void }) =>
        config.callback({ credential: 'google-id-token' }),
    );
    Object.assign(window, {
      google: { accounts: { id: { initialize, prompt: vi.fn() } } },
    });

    await expect(getGoogleIdToken('client-id')).resolves.toBe(
      'google-id-token',
    );
    await expect(getGoogleIdToken('client-id')).resolves.toBe(
      'google-id-token',
    );

    expect(appendChild).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'client-id' }),
    );
  });
});
