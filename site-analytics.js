(function() {
  'use strict';

  var ADMIN_KEY = 'slTransitAdminDevice';
  var DEVICE_KEY = 'slTransitAnalyticsDeviceV1';
  var ENDPOINT = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/trackWebVisit';
  var ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;
  var lastActivitySentAt = 0;

  try {
    if (localStorage.getItem(ADMIN_KEY) === '1') return;
  } catch (err) {}
  if (navigator.webdriver) return;

  function randomId(prefix) {
    var cryptoObj = window.crypto || window.msCrypto;
    if (cryptoObj && cryptoObj.getRandomValues) {
      var bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      return prefix + Array.prototype.map.call(bytes, function(byte) {
        return ('0' + byte.toString(16)).slice(-2);
      }).join('');
    }
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
  }

  function storedId(key, prefix) {
    try {
      var value = localStorage.getItem(key) || '';
      if (!value) {
        value = randomId(prefix);
        localStorage.setItem(key, value);
      }
      return value;
    } catch (err) {
      return randomId(prefix);
    }
  }

  function pageCategory() {
    var path = (location.pathname || '/').replace(/\/+/g, '/');
    var file = (path.split('/').pop() || 'index.html').toLowerCase();
    if (!file || file === 'index.html') return 'home';
    if (file === 'booking1.html') return 'booking';
    if (file === 'passenger.html') return 'passenger';
    if (file === 'check_ticket.html' || file === 'track_trip.html') return 'ticket_check';
    if (file === 'cancel_ticket.html') return 'cancellation';
    if (file === 'info.html') return 'help_info';
    return '';
  }

  function send(payload) {
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
      } catch (err) {}
    }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'omit'
      }).catch(function() {});
    } catch (err) {}
  }

  function payload(type, source) {
    var category = pageCategory();
    if (!category) return null;
    var data = {
      contractVersion: 'web_analytics_v1',
      eventType: type,
      deviceId: storedId(DEVICE_KEY, 'd_'),
      pageCategory: category
    };
    if (type === 'activity') data.activitySource = source;
    return data;
  }

  function track() {
    var data = payload('page_view');
    if (data) send(data);
  }

  function activity(source) {
    var now = Date.now();
    if (now - lastActivitySentAt < ACTIVITY_THROTTLE_MS) return;
    lastActivitySentAt = now;
    var data = payload('activity', source);
    if (data) send(data);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', track, { once: true });
  else track();
  document.addEventListener('click', function() { activity('click'); }, { passive: true });
  document.addEventListener('keydown', function() { activity('keydown'); });
  document.addEventListener('touchstart', function() { activity('touchstart'); }, { passive: true });
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') activity('visibilitychange');
  });
})();
