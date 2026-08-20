import { env } from '../../shared/env';
import {
  registerWebPushSubscription,
  unregisterWebPushSubscription,
} from './api';

export type WebPushStatus =
  | 'checking'
  | 'unsupported'
  | 'unconfigured'
  | 'default'
  | 'denied'
  | 'enabled';

const SERVICE_WORKER_URL = '/web-push/sw.js';

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function toArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
    .buffer as ArrayBuffer;
}

export async function getWebPushStatus(): Promise<WebPushStatus> {
  if (!isSupported()) return 'unsupported';
  if (env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY === undefined) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  const registration =
    await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  const subscription = await registration?.pushManager.getSubscription();
  return subscription === null || subscription === undefined
    ? 'default'
    : 'enabled';
}

export async function enableWebPush(): Promise<WebPushStatus> {
  if (!isSupported()) return 'unsupported';
  const publicKey = env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
  if (publicKey === undefined) return 'unconfigured';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    return permission === 'denied' ? 'denied' : 'default';

  const registration = await navigator.serviceWorker.register(
    SERVICE_WORKER_URL,
    {
      scope: '/',
    },
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toArrayBuffer(publicKey),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    return 'default';
  }
  await registerWebPushSubscription({
    endpoint: json.endpoint,
    expirationTime: json.expirationTime,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return 'enabled';
}

export async function disableWebPush(): Promise<void> {
  if (!isSupported()) return;
  const registration =
    await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription === null || subscription === undefined) return;
  await unregisterWebPushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}
