/* Web Push handler. Add this line at the very top of sw.js AND sw-staff.js:
   importScripts('push-handler.js');
*/
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      /* app is open and visible: the in-app banner + sound already handles it */
      if (list.some(function (c) { return c.visibilityState === 'visible'; })) return;
      return self.registration.showNotification(d.title || 'SONE RESTAURANT', {
        body: d.body || '',
        icon: d.icon || undefined,
        tag: d.tag || undefined,
        renotify: true,
        silent: false,
        vibrate: [200, 100, 200],
        data: { url: d.url || './' }
      });
    })
  );
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
      return self.clients.openWindow(url);
    })
  );
});
