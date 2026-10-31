self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || 'Penugasan baru dari SIPES';
  const options = {
    body: payload.body || 'Ada tugas pengangkutan sampah baru. Buka SIPES untuk melihat detail.',
    icon: '/pwa-icon.svg',
    badge: '/pwa-icon.svg',
    tag: payload.tag || 'sipes-assignment',
    data: { url: payload.url || '/?page=Penugasan' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/?page=Penugasan', self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.navigate(target.href);
      await client.focus();
      client.postMessage({ type: 'new-assignment' });
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});
