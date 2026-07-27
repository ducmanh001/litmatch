import { getFacebookAccessToken } from './facebook-identity';

describe('getFacebookAccessToken', () => {
  it('loads the official SDK and returns only the access token from its login callback', async () => {
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      window.setTimeout(() => script.onload?.(new Event('load')), 0);
      return node;
    });
    const init = vi.fn();
    const login = vi.fn(
      (
        callback: (response: { authResponse: { accessToken: string } }) => void,
      ) => callback({ authResponse: { accessToken: 'facebook-access-token' } }),
    );
    Object.assign(window, { FB: { init, login } });

    await expect(
      getFacebookAccessToken('facebook-app-id', 'v24.0'),
    ).resolves.toBe('facebook-access-token');
    expect(init).toHaveBeenCalledWith({
      appId: 'facebook-app-id',
      cookie: true,
      version: 'v24.0',
    });
    expect(login).toHaveBeenCalledWith(expect.any(Function), {
      scope: 'public_profile',
    });
  });
});
