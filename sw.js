'use strict';
var CACHE_NAME = 'sl-transit-icons-20260620b';
var ICON_ASSETS = [
  'manifest.webmanifest?v=20260620b',
  'assets/app-icon-192.png?v=20260620b',
  'driver-android/src/main/res/drawable-nodpi/app_cover.png?v=20260620b'
];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(ICON_ASSETS); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.indexOf('sl-transit-icons-') === 0 && key !== CACHE_NAME; })
      .map(function (key) { return caches.delete(key); }));
  }));
  self.clients.claim();
});
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('manifest.webmanifest') === -1 && url.pathname.indexOf('app_cover.png') === -1
      && url.pathname.indexOf('ic_launcher.png') === -1) return;
  event.respondWith(fetch(event.request).then(function (response) {
    var copy = response.clone();
    caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
    return response;
  }).catch(function () { return caches.match(event.request); }));
});