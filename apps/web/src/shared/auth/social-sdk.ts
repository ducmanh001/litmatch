/**
 * Lấy ID token từ SDK chính chủ của provider (Google Identity Services / Sign in with Apple)
 * — token đưa về `POST /auth/social`, server tự verify chữ ký + issuer + audience, KHÔNG tin
 * client. SDK chỉ tải khi user bấm nút (lazy), không nhúng sẵn vào bundle.
 */

export {
  getFacebookAccessToken,
  getGoogleIdToken,
} from '@litmatch/browser-auth';

let appleScriptPromise: Promise<void> | undefined;

function loadAppleScript(): Promise<void> {
  if (appleScriptPromise !== undefined) return appleScriptPromise;
  appleScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      appleScriptPromise = undefined;
      reject(new Error('Không tải được SDK Apple.'));
    };
    document.head.appendChild(script);
  });
  return appleScriptPromise;
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
  await loadAppleScript();
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
