const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

let googleScriptPromise: Promise<void> | undefined;

function loadGoogleIdentityScript(): Promise<void> {
  if (googleScriptPromise !== undefined) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleScriptPromise = undefined;
      reject(new Error('Không tải được SDK Google.'));
    };
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

type GoogleCredentialResponse = { credential?: string };
type GooglePromptNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
};
type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  prompt: (listener?: (notification: GooglePromptNotification) => void) => void;
};

/**
 * Lấy ID token từ Google Identity Services. Backend vẫn là nơi verify chữ ký, issuer và
 * audience; adapter này không tạo session và không quyết định role.
 */
export async function getGoogleIdToken(clientId: string): Promise<string> {
  await loadGoogleIdentityScript();
  const idApi = (
    window as unknown as { google?: { accounts?: { id?: GoogleIdApi } } }
  ).google?.accounts?.id;
  if (idApi === undefined) {
    throw new Error('SDK Google chưa sẵn sàng, thử lại.');
  }

  return new Promise<string>((resolve, reject) => {
    idApi.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential !== undefined && response.credential !== '') {
          resolve(response.credential);
          return;
        }
        reject(new Error('Google không trả về ID token.'));
      },
    });
    idApi.prompt((notification) => {
      if (
        notification.isNotDisplayed?.() === true ||
        notification.isSkippedMoment?.() === true ||
        notification.isDismissedMoment?.() === true
      ) {
        reject(
          new Error(
            'Không mở được cửa sổ Google — kiểm tra popup/cookie của trình duyệt.',
          ),
        );
      }
    });
  });
}
