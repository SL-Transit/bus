(function (global) {
  'use strict';
  var CONFIG = global.SL_TRANSIT_FIREBASE_CONFIG || {
    apiKey: 'AIzaSyCuWN1RhTSnKjbg5vliTEXa8HtgY7j2spM',
    authDomain: 'sl-transit-9464e.firebaseapp.com',
    databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'sl-transit-9464e',
    storageBucket: 'sl-transit-9464e.firebasestorage.app',
    messagingSenderId: '480076551107',
    appId: '1:480076551107:web:0548531ec69327a2bfe376'
  };
  var FUNCTION_URL = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/publishAdminSchedule';
  var state = { published: null, error: '', loading: false, candidate: null, user: null };

  function values(value) { return value && typeof value === 'object' ? Object.keys(value).map(function (key) { return value[key]; }) : []; }
  function count(value) { return values(value).length; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function groupRows(rows) {
    var grouped = {};
    values(rows).forEach(function (row) {
      var key = row.queueTripId || row.canonicalQueueTripId || row.scheduleOfferId || row.routeId || row.sourceRowId;
      if (!key) return;
      grouped[key] = grouped[key] || { key: key, route: row.routeLabelTh || row.routeNameTh || row.routeId || '-', group: row.serviceGroupId || '-', times: [] };
      if (row.scheduledTime || row.departureTime) grouped[key].times.push(row.scheduledTime || row.departureTime);
    });
    return values(grouped).sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); });
  }
  function statusText() {
    if (state.loading) return '<span class="status">กำลังอ่านข้อมูลกลาง</span>';
    if (state.error) return '<span class="status">อ่านข้อมูลไม่ได้</span>';
    if (!state.published || state.published.publicationStatus !== 'published') return '<span class="status">ไม่มีตารางที่เผยแพร่</span>';
    return '<span class="status ready">เผยแพร่แล้ว</span>';
  }
  function opsView() {
    var p = state.published || {};
    var rows = groupRows(p.scheduleRows);
    var body = rows.length ? rows.map(function (row) {
      return '<tr><td class="primary-cell"><strong>' + esc(row.key) + '</strong><span class="sub">' + esc(row.group) + '</span></td><td>' + esc(row.times[0] || '-') + '</td><td class="route-cell"><strong>' + esc(row.route) + '</strong><span>publishedSchedule</span></td><td>' + esc(row.group) + '</td><td>' + esc(row.times.join(', ') || '-') + '</td><td><span class="status ready">แสดงเมื่อเผยแพร่</span></td><td><button class="action" data-network-refresh="1">รีเฟรช</button></td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty"><div><strong>ไม่มีตารางให้แสดง</strong><span>เมื่อ Admin Publish ตารางแล้ว ระบบจะแสดงที่นี่และหน้าผู้ใช้ทุกหน้า</span></div></div></td></tr>';
    return '<div class="crumb">SL-Transit / Network</div><div class="head"><div><h1>การเดินรถ / ตารางเที่ยวบริการ</h1><p>ตารางจาก publishedSchedule ชุดเดียวกับ Passenger และ Booking</p></div><button class="btn primary" data-network-refresh="1">รีเฟรชข้อมูล</button></div>' +
      '<div class="kpis"><article class="card kpi"><div class="label">สถานะ</div><div class="value" style="font-size:20px">' + statusText() + '</div></article><article class="card kpi"><div class="label">เที่ยวที่แสดง</div><div class="value">' + rows.length + '</div></article><article class="card kpi"><div class="label">แถวตารางกลาง</div><div class="value">' + count(p.scheduleRows) + '</div></article><article class="card kpi"><div class="label">กติกาไม่มีตาราง</div><div class="value" style="font-size:20px">ซ่อน</div></article></div>' +
      '<section class="card"><div class="toolbar"><div><strong>ตารางเที่ยวรถ</strong><span class="label">อ่านจาก publishedSchedule เท่านั้น</span></div><div class="actions"><input type="file" accept=".json" data-network-file><button class="btn primary" data-network-publish>Publish ตาราง</button></div></div><div class="table-wrap"><table class="table schedule-table"><thead><tr><th>รหัสเที่ยว</th><th>เวลาแรก</th><th>เส้นทาง</th><th>กลุ่ม</th><th>เวลาทั้งหมด</th><th>การแสดงผล</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div></section>' +
      '<div class="lower"><section class="card detail"><h2>การเผยแพร่</h2><div class="notice">ฉบับร่าง → ตรวจสอบ → Owner Publish → แสดงทุกหน้า หากไม่มีตารางจะไม่แสดงข้อมูลเก่า</div></section><section class="card detail"><h2>แหล่งข้อมูล</h2><div class="notice">' + (p.publicationVersion ? 'รุ่น ' + esc(p.publicationVersion) : 'ยังไม่มี publishedSchedule') + '</div></section></div>';
  }
  function load() {
    if (!global.firebase || !global.firebase.database) return;
    state.loading = true;
    if (!global.firebase.apps.length) global.firebase.initializeApp(CONFIG);
    global.firebase.database().ref('publishedSchedule').once('value').then(function (snap) {
      state.published = snap.val() || null; state.error = ''; state.loading = false; render();
    }).catch(function (err) { state.error = err && err.message || 'read_failed'; state.loading = false; render(); });
  }
  function publish() {
    var user = global.firebase && global.firebase.auth && global.firebase.auth().currentUser;
    if (!state.candidate) { state.error = 'กรุณาเลือก candidate JSON ก่อน Publish'; render(); return; }
    if (!user) { state.error = 'ต้องเข้าสู่ระบบด้วย Owner ก่อน Publish'; render(); return; }
    user.getIdToken(true).then(function (token) { return fetch(FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(state.candidate) }); }).then(function (response) { return response.json().then(function (body) { if (!response.ok) throw new Error((body.blockers || [body.error || 'publish_failed']).join(', ')); return body; }); }).then(function (body) { state.error = ''; state.candidate = null; load(); global.alert('เผยแพร่ตารางแล้ว รุ่น ' + body.publicationVersion); }).catch(function (err) { state.error = err.message || 'publish_failed'; render(); });
  }
  function render() { var views = global.SLTransitAdminViews; var renderer = global.SLTransitAdminRender; if (views && renderer) { views.ops = opsView; views.timetable = opsView; if (document.body.getAttribute('data-page') === 'ops') renderer('ops'); } }
  global.SLTransitAdminNetwork = { load: load, render: render, state: state, groupRows: groupRows };
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-network-refresh]')) load();
    if (event.target.closest('[data-network-publish]')) publish();
  });
  document.addEventListener('change', function (event) {
    var input = event.target.closest('[data-network-file]');
    if (!input || !input.files || !input.files[0]) return;
    var reader = new FileReader();
    reader.onload = function () { try { state.candidate = JSON.parse(reader.result); state.error = ''; render(); } catch (err) { state.error = 'candidate JSON ไม่ถูกต้อง'; render(); } };
    reader.readAsText(input.files[0]);
  });
  if (global.SLTransitAdminViews) { global.SLTransitAdminViews.ops = opsView; global.SLTransitAdminViews.timetable = opsView; }
  if (global.firebase) load(); else { global.addEventListener('load', load); }
})(window);
