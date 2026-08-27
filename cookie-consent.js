(function (global, document) {
  'use strict';
  var KEY = 'slTransitCookieConsent';
  var EVENT = 'sltransit:consent-changed';
  var state = { necessary: true, analytics: false, decided: false };
  function read() {
    try {
      var parsed = JSON.parse(global.localStorage.getItem(KEY) || 'null');
      if (parsed && typeof parsed.analytics === 'boolean') { state.analytics = parsed.analytics; state.decided = true; }
    } catch (e) {}
  }
  function removeBanner() { var old = document.getElementById('sl-cookie-consent'); if (old) old.remove(); }
  function save(analytics) {
    state.analytics = analytics === true; state.decided = true;
    try { global.localStorage.setItem(KEY, JSON.stringify({ necessary: true, analytics: state.analytics, savedAt: new Date().toISOString() })); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent(EVENT, { detail: { necessary: true, analytics: state.analytics } })); } catch (e) {}
    removeBanner();
  }
  function showBanner() {
    if (state.decided || document.getElementById('sl-cookie-consent')) return;
    var style = document.createElement('style');
    style.textContent = '#sl-cookie-consent{position:fixed;z-index:2147483000;left:16px;right:16px;bottom:16px;max-width:760px;margin:auto;background:#fff;color:#17212b;border:1px solid #d8e5ee;border-radius:16px;box-shadow:0 10px 35px rgba(15,58,95,.2);padding:18px;font:14px/1.5 Arial,sans-serif}#sl-cookie-consent h2{font-size:18px;margin:0 0 7px;color:#0f3a5f}#sl-cookie-consent p{margin:0 0 12px}#sl-cookie-consent a{color:#0b6ea8;text-decoration:underline}#sl-cookie-consent .actions{display:flex;flex-wrap:wrap;gap:8px}#sl-cookie-consent button{border:1px solid #0b6ea8;border-radius:9px;padding:9px 13px;font:inherit;cursor:pointer}.sl-cookie-accept{background:#0b6ea8;color:#fff}';
    document.head.appendChild(style);
    var box = document.createElement('section'); box.id = 'sl-cookie-consent'; box.setAttribute('role','dialog'); box.setAttribute('aria-label','การตั้งค่าคุกกี้');
    box.innerHTML = '<h2>การใช้คุกกี้และพื้นที่เก็บข้อมูล</h2><p>เว็บไซต์ใช้ข้อมูลที่จำเป็นต่อการทำงาน เช่น เซสชันการจองและความปลอดภัย ส่วนสถิติการใช้งานเป็นตัวเลือกและจะทำงานเมื่อคุณยินยอมเท่านั้น <a href="privacy.html" target="_blank" rel="noopener">อ่านรายละเอียดข้อมูลที่เก็บ</a></p><div class="actions"><button type="button" class="sl-cookie-accept" data-consent="all">ยอมรับทั้งหมด</button><button type="button" data-consent="necessary">ปฏิเสธสิ่งที่ไม่จำเป็น</button><button type="button" data-consent="settings">ตั้งค่า</button></div>';
    box.addEventListener('click', function (event) { var button = event.target.closest('button[data-consent]'); if (!button) return; var choice = button.getAttribute('data-consent'); if (choice === 'settings') save(global.confirm('อนุญาตให้เก็บสถิติการใช้งานแบบไม่ระบุตัวบุคคลหรือไม่?\nกด OK = ยินยอม, Cancel = ปฏิเสธ')); else save(choice === 'all'); });
    document.body.appendChild(box);
  }
  read();
  global.SLTransitConsent = { hasAnalyticsConsent: function(){ return state.analytics === true; }, hasDecided: function(){ return state.decided === true; }, reset: function(){ try{global.localStorage.removeItem(KEY);}catch(e){} state.decided=false; state.analytics=false; showBanner(); }, eventName: EVENT };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBanner); else showBanner();
}(window, document));
