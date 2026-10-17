/* offline.js - makes index.html, punch.html and staff.html open and work without internet.
   One file, two roles:
   1) loaded with <script src="offline.js"> it registers itself, shows an Offline badge, warms the face-engine cache
      and re-syncs when the internet is back;
   2) run as the service worker it caches the app, and the face engine, and keeps push notifications working.
   If you keep your own sw.js / sw-staff.js, put   importScripts('offline.js');   on its first line instead. */
(function () {
  'use strict';
  var V = 'sone-offline-v1';
  var FACE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/';
  var MODELS = ['tiny_face_detector_model', 'face_landmark_68_model', 'face_recognition_model'];
  var SHELL = ['./', 'index.html', 'punch.html', 'staff.html', 'offline.js', 'config.js', 'manifest.json',
    'manifest-punch.json', 'manifest-staff.json', 'apple-touch-icon.png', 'punch-192.png', 'staff-192.png'];
  var isSW = typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;

  /* ============================ SERVICE WORKER ============================ */
  if (isSW) {
    self.addEventListener('install', function (e) {
      e.waitUntil(caches.open(V).then(function (c) {
        return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
      }).then(function () { return self.skipWaiting(); }));
    });
    self.addEventListener('activate', function (e) {
      e.waitUntil(caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k.indexOf('sone-offline-') === 0 && k !== V; }).map(function (k) { return caches.delete(k); }));
      }).then(function () { return self.clients.claim(); }));
    });
    var okRes = function (r) { return r && (r.ok || r.type === 'opaque'); };
    var stripKey = function (u) { return new Request(u.origin + u.pathname); };
    function netFirst(req, u) {
      var key = stripKey(u), cached = function () { return caches.match(key, { ignoreSearch: true, ignoreVary: true }); };
      var net = fetch(req).then(function (res) {
        if (res && res.ok && !res.redirected) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(key, cp); }); }
        return res;
      });
      var timer = new Promise(function (resolve) {
        setTimeout(function () { cached().then(function (m) { if (m) resolve(m); }); }, 4000);
      });
      return Promise.race([net, timer]).catch(function () {
        return cached().then(function (m) { return m || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()); });
      }).then(function (r) { return r || cached(); });
    }
    function cacheFirst(req) {
      return caches.match(req, { ignoreVary: true }).then(function (m) {
        return m || fetch(req).then(function (res) {
          if (okRes(res)) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(req, cp); }); }
          return res;
        });
      });
    }
    function staleWhile(req) {
      return caches.match(req, { ignoreVary: true }).then(function (m) {
        var net = fetch(req).then(function (res) { if (okRes(res)) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(req, cp); }); } return res; });
        return m || net;
      });
    }
    self.addEventListener('fetch', function (e) {
      var r = e.request; if (r.method !== 'GET') return;
      var u = new URL(r.url);
      if (/supabase\.co$/.test(u.hostname) || /\/(rest|auth|functions|storage|realtime)\/v1\//.test(u.pathname)) return;
      if (u.origin === location.origin) {
        if (r.mode === 'navigate' || /\.(html|js|json)$/.test(u.pathname) || /\/$/.test(u.pathname)) e.respondWith(netFirst(r, u));
        else e.respondWith(staleWhile(r));
      } else if (/(^|\.)(jsdelivr\.net|cdnjs\.cloudflare\.com|googleapis\.com|gstatic\.com)$/.test(u.hostname)) {
        e.respondWith(cacheFirst(r));
      }
    });
    self.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'offline-ping' && e.source) e.source.postMessage({ type: 'offline-pong', v: V });
      if (d.type === 'skip-waiting') self.skipWaiting();
    });
    /* push + notification click: only when this file is the main worker (not imported by your own sw.js) */
    if (/offline\.js$/.test(self.location.pathname)) {
      self.addEventListener('push', function (e) {
        var d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { try { d = { body: e.data.text() }; } catch (__) {} }
        e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
          cs.forEach(function (c) { c.postMessage({ type: 'push-refresh' }); });
          if (cs.some(function (c) { return c.visibilityState === 'visible'; })) return;
          return self.registration.showNotification(d.title || d.t || 'Notification', {
            body: d.body || d.text || '', tag: d.tag || 'sone', icon: d.icon || 'punch-192.png', data: d });
        }));
      });
      self.addEventListener('notificationclick', function (e) {
        e.notification.close();
        var url = (e.notification.data && e.notification.data.url) || './';
        e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
          for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) return cs[i].focus(); }
          return self.clients.openWindow(url);
        }));
      });
    }
    return;
  }

  /* ================================= PAGE ================================= */
  if (typeof window === 'undefined') return;
  var lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var hindi = function () { return /^hi/i.test(document.documentElement.lang || lsGet('lang') || ''); };
  var badge = null, hideT = 0;
  function showBadge(txt, color) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 6px);z-index:2147483000;' +
        'padding:5px 12px;border-radius:14px;font:600 12px/1.3 -apple-system,Roboto,sans-serif;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.25);pointer-events:none;max-width:92vw;text-align:center';
      document.body.appendChild(badge);
    }
    clearTimeout(hideT); badge.textContent = txt; badge.style.background = color; badge.style.display = 'block';
  }
  function net() {
    if (!navigator.onLine) {
      showBadge(hindi() ? 'ऑफ़लाइन · डेटा इस फ़ोन में सुरक्षित है' : 'Offline · your data is saved on this phone', '#ff9500');
    } else if (badge && badge.style.display !== 'none') {
      showBadge(hindi() ? 'इंटरनेट वापस आया' : 'Back online', '#34c759');
      hideT = setTimeout(function () { badge.style.display = 'none'; }, 2500);
    }
  }
  function kick() {
    ['syncNow', 'syncAll', 'pull', 'rqPoll', 'rqSync', 'rqFlush'].forEach(function (n) { try { if (typeof window[n] === 'function') window[n](); } catch (e) {} });
  }
  addEventListener('online', function () { net(); setTimeout(kick, 800); });
  addEventListener('offline', net);
  addEventListener('load', function () { net(); setTimeout(register, 2500); setTimeout(warm, 6000); });

  function ping(reg) {
    return new Promise(function (resolve) {
      var w = reg && (reg.active || reg.waiting || reg.installing); if (!w) return resolve(false);
      var done = false, ch = new MessageChannel();
      ch.port1.onmessage = function (m) { if (m.data && m.data.type === 'offline-pong') { done = true; resolve(true); } };
      try { w.postMessage({ type: 'offline-ping' }, [ch.port2]); } catch (e) { return resolve(false); }
      setTimeout(function () { if (!done) resolve(false); }, 1200);
    });
  }
  function register() {
    if (!('serviceWorker' in navigator)) return;
    var host = location.hostname;
    if (location.protocol !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return;
    if (/claude|anthropic/i.test(host)) return;
    var staff = /staff\.html$/.test(location.pathname);
    var scope = staff ? new URL('./staff.html', location.href).href : new URL('./', location.href).href;
    navigator.serviceWorker.getRegistration(location.href).then(function (reg) {
      var mine = reg && reg.active && /offline\.js/.test(reg.active.scriptURL || '');
      if (mine) return reg.update().catch(function () {});
      if (window.OFFLINE_KEEP_SW) return;
      return ping(reg).then(function (can) { if (!can) return navigator.serviceWorker.register('offline.js', { scope: scope }); });
    }).catch(function () {});
  }
  function warm() {
    if (!navigator.onLine || !window.caches || lsGet('offline_warm') === V) return;
    var cn = navigator.connection; if (cn && (cn.saveData || /2g/.test(cn.effectiveType || ''))) return;
    var urls = [FACE + 'dist/face-api.js'];
    MODELS.forEach(function (m) { urls.push(FACE + 'model/' + m + '.json', FACE + 'model/' + m + '.bin'); });
    caches.open(V).then(function (c) {
      return Promise.all(urls.map(function (u) {
        return c.match(u).then(function (h) { return h || fetch(u).then(function (r) { if (r.ok) return c.put(u, r); }); });
      }));
    }).then(function () { try { localStorage.setItem('offline_warm', V); } catch (e) {} }).catch(function () {});
  }
})();
