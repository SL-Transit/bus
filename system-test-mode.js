(function (global) {
  'use strict';

  var CHECK_URL = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/readSystemTestModeStatus';
  var overlayId = 'slTransitSystemTestOverlay';

  function safeText(value, fallback) {
    var text = String(value == null ? '' : value).trim();
    return text ? text.slice(0, 500) : fallback;
  }

  function showOverlay(config) {
    if (!document.body) return;
    var existing = document.getElementById(overlayId);
    if (existing) return;
    var overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(3,18,36,.82);display:grid;place-items:center;padding:20px;font-family:system-ui,-apple-system,sans-serif;';
    var card = document.createElement('section');
    card.style.cssText = 'width:min(560px,100%);background:#fff;border-radius:18px;padding:26px;box-shadow:0 20px 70px rgba(0,0,0,.35);color:#172033;text-align:center;';
    var title = document.createElement('h1');
    title.textContent = safeText(config.title, 'กำลังทดสอบระบบ');
    title.style.cssText = 'margin:0 0 12px;font-size:24px;';
    var message = document.createElement('p');
    message.textContent = safeText(config.message, 'ขณะนี้ทีมงานกำลังทดสอบระบบเพื่อให้บริการได้มั่นคงขึ้นชั่วคราว');
    message.style.cssText = 'margin:0 0 14px;line-height:1.7;font-size:16px;';
    var reason = document.createElement('p');
    reason.textContent = safeText(config.reason, 'ระหว่างนี้จะไม่สามารถสร้างรายการจองหรือส่งข้อความแจ้งเตือนได้');
    reason.style.cssText = 'margin:0;color:#667085;line-height:1.6;';
    card.appendChild(title);
    card.appendChild(message);
    card.appendChild(reason);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.setAttribute('data-system-test-mode', 'true');
  }

  function hideOverlay() {
    if (!document.body) return;
    var overlay = document.getElementById(overlayId);
    if (overlay) overlay.remove();
    document.body.removeAttribute('data-system-test-mode');
  }

  function apply(config) {
    config = config && typeof config === 'object' ? config : {};
    var enabled = config.enabled === true;
    global.SLTransitSystemTestMode = enabled;
    global.SLTransitSystemTestConfig = config;
    if (enabled) showOverlay(config); else hideOverlay();
    global.dispatchEvent(new CustomEvent('sltransit:system-test-mode', { detail: config }));
  }

  function read() {
    if (typeof fetch !== 'function') return Promise.resolve();
    return fetch(CHECK_URL + '?t=' + Date.now(), { credentials: 'omit', cache: 'no-store' })
      .then(function (response) { return response.ok ? response.json() : {}; })
      .then(apply)
      .catch(function () {});
  }

  global.SLTransitSystemTestMode = false;
  global.SLTransitSystemTestConfig = {};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', read);
  else read();
  setInterval(read, 15000);
}(window));
