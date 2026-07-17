/**
 * Lấy ID token từ SDK chính chủ của provider (Google Identity Services / Sign in with Apple)
 * — token đưa về `POST /auth/social`, server tự verify chữ ký + issuer + audience, KHÔNG tin
 * client. SDK chỉ tải khi user bấm nút (lazy), không nhúng sẵn vào bundle.
 */

const loadedScripts = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = loadedScripts.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadedScripts.delete(src);
      reject(new Error(`Không tải được SDK: ${src}`));
    };
    document.head.appendChild(script);
  });
  loadedScripts.set(src, promise);
  return promise;
}

type GoogleCredentialResponse = { credential?: string };
type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  prompt: (listener?: (notification: unknown) => void) => void;
};

export async function getGoogleIdToken(clientId: string): Promise<string> {
  await loadScript('https://accounts.google.com/gsi/client');
  const google = (
    window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }
  ).google;
  const idApi = google?.accounts?.id;
  if (!idApi) throw new Error('SDK Google chưa sẵn sàng, thử lại.');

  return new Promise<string>((resolve, reject) => {
    idApi.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) resolve(response.credential);
        else reject(new Error('Google không trả về ID token.'));
      },
    });
    idApi.prompt((notification) => {
      const n = notification as {
        isNotDisplayed?: () => boolean;
        isSkippedMoment?: () => boolean;
      };
      if (n.isNotDisplayed?.() === true || n.isSkippedMoment?.() === true) {
        reject(
          new Error(
            'Không mở được cửa sổ Google — kiểm tra popup/cookie của trình duyệt.',
          ),
        );
      }
    });
  });
}

type AppleIdApi = {
  auth: {
    init: (config: {
      clientId: string;
      scope: string;
      redirectURI: string;
      usePopup: boolean;
    }) => void;
    signIn: () => Promise<{ authorization?: { id_token?: string } }>;
  };
};

export async function getAppleIdToken(clientId: string): Promise<string> {
  await loadScript(
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
  );
  const appleId = (window as unknown as { AppleID?: AppleIdApi }).AppleID;
  if (!appleId) throw new Error('SDK Apple chưa sẵn sàng, thử lại.');

  appleId.auth.init({
    clientId,
    scope: 'name email',
    redirectURI: `${window.location.origin}/login`,
    usePopup: true,
  });
  const result = await appleId.auth.signIn();
  const idToken = result.authorization?.id_token;
  if (!idToken) throw new Error('Apple không trả về ID token.');
  return idToken;
}
