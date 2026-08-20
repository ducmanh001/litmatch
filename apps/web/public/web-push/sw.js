/* Litmatch Web Push worker — không chứa auth/token, chỉ render payload đã được server gửi. */
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const data = event.data ? event.data.json() : {};
      const payload = data.payload || {};
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const hasVisibleWindow = windows.some(
        (client) => client.visibilityState === 'visible',
      );
      if (hasVisibleWindow) return;

      const isMessage = data.type === 'friend_message';
      const url =
        isMessage && payload.senderUserId
          ? `/chat/${payload.senderUserId}`
          : '/friends';
      const body =
        isMessage && typeof payload.preview === 'string'
          ? payload.preview
          : 'Bạn có thông báo mới trên Litmatch.';
      await self.registration.showNotification(
        isMessage ? 'Tin nhắn mới' : 'Thông báo mới',
        {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: data.notificationId || 'litmatch-notification',
          data: { url },
        },
      );
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/friends';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const existing = windows.find((client) => 'focus' in client);
        if (existing) {
          void existing.navigate(url);
          return existing.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
