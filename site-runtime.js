(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var inLine = /\bLine\//i.test(ua) || /\bLIFF/i.test(ua);
  if (inLine) {
    var target = new URL(window.location.href);
    if (target.searchParams.get('openExternalBrowser') !== '1') {
      target.searchParams.set('openExternalBrowser', '1');
      if (/Android/i.test(ua)) {
        var fallback = encodeURIComponent(target.toString());
        var intent = 'intent://' + target.host + target.pathname + target.search
          + '#Intent;scheme=https;action=android.intent.action.VIEW;'
          + 'category=android.intent.category.BROWSABLE;S.browser_fallback_url=' + fallback + ';end';
        window.location.replace(intent);
      } else {
        window.location.replace(target.toString());
      }
      return;
    }
    window.addEventListener('DOMContentLoaded', function () {
      document.body.innerHTML = '<main style="font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:24px;text-align:center">'
        + '<h1 style="font-size:22px">กรุณาเปิดผ่านเบราว์เซอร์หลัก</h1>'
        + '<p>เว็บไซต์ S.L. Transit ไม่รองรับ LINE Browser</p>'
        + '<a href="' + target.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '" target="_blank" rel="external noopener" '
        + 'style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0b3a63;color:#fff;text-decoration:none">เปิด Chrome / Safari</a>'
        + '</main>';
    });
    return;
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js?v=20260621a').catch(function () {});
    });
  }
})();