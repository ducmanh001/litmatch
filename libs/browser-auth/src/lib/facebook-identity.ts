const FACEBOOK_SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';

let facebookScriptPromise: Promise<void> | undefined;

function loadFacebookSdk(): Promise<void> {
  if (facebookScriptPromise !== undefined) return facebookScriptPromise;

  facebookScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = FACEBOOK_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      facebookScriptPromise = undefined;
      reject(new Error('Không tải được SDK Facebook.'));
    };
    document.head.appendChild(script);
  });
  return facebookScriptPromise;
}

type FacebookLoginResponse = {
  authResponse?: { accessToken?: string };
};
type FacebookApi = {
  init: (config: { appId: string; cookie: boolean; version: string }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: { scope: string },
  ) => void;
};

/** Returns an access token only; the core API validates it with Facebook before issuing a session. */
export async function getFacebookAccessToken(
  appId: string,
  apiVersion: string,
): Promise<string> {
  await loadFacebookSdk();
  const facebook = (window as unknown as { FB?: FacebookApi }).FB;
  if (facebook === undefined) {
    throw new Error('SDK Facebook chưa sẵn sàng, thử lại.');
  }

  facebook.init({ appId, cookie: true, version: apiVersion });
  return new Promise<string>((resolve, reject) => {
    facebook.login(
      (response) => {
        const accessToken = response.authResponse?.accessToken;
        if (accessToken) {
          resolve(accessToken);
          return;
        }
        reject(
          new Error(
            'Đăng nhập Facebook đã bị huỷ hoặc không trả access token.',
          ),
        );
      },
      { scope: 'public_profile' },
    );
  });
}
