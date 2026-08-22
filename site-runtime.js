(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var inLine = /\bLine\//i.test(ua) || /\bLIFF/i.test(ua);
  if (!inLine) {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js?v=20260621a').catch(function () {});
      });
    }
    return;
  }

  var target = new URL(window.location.href);
  target.searchParams.set('openExternalBrowser', '1');
  var targetUrl = target.toString();

  function showExitOverlay() {
    var render = function () {
      document.body.innerHTML = '<main style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:24px;text-align:center">'
        + '<h1 style="font-size:22px">กรุณาเปิดผ่านเบราว์เซอร์หลัก</h1>'
        + '<p>เว็บไซต์ S.L. Transit ไม่รองรับ LINE Browser</p>'
        + '<a href="' + targetUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" target="_blank" rel="external noopener" '
        + 'style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0b3a63;color:#fff;text-decoration:none">เปิด Chrome / Safari</a>'
        + '</main>';
    };
    if (document.body) render();
    else window.addEventListener('DOMContentLoaded', render);
  }

  // Already round-tripped once (came back from a hand-off attempt, or user
  // followed the manual link) and still inside LINE: stop trying, just show
  // the manual exit instructions.
  if (window.location.search.indexOf('openExternalBrowser=1') !== -1) {
    showExitOverlay();
    return;
  }

  // Attempt an automatic hand-off. This can fail SILENTLY (LINE's webview
  // ignores the custom scheme on some app/OS versions) with no error and no
  // navigation — in that case the page would otherwise keep running normally
  // inside LINE with no warning at all. Detect that by checking whether the
  // page actually got backgrounded/unloaded shortly after the attempt; if
  // not, fall back to the manual overlay instead of silently doing nothing.
  var left = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) left = true;
  });
  window.addEventListener('pagehide', function () { left = true; });

  if (/Android/i.test(ua)) {
    var fallback = encodeURIComponent(targetUrl);
    var intent = 'intent://' + target.host + target.pathname + target.search
      + '#Intent;scheme=https;action=android.intent.action.VIEW;'
      + 'category=android.intent.category.BROWSABLE;S.browser_fallback_url=' + fallback + ';end';
    window.location.replace(intent);
  } else {
    window.location.href = 'googlechrome://' + targetUrl.replace(/^https?:\/\//, '');
  }

  setTimeout(function () {
    if (left || document.hidden) return;
    showExitOverlay();
  }, 1200);
})();