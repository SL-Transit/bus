(function (global) {
  'use strict';
  var FUNCTION_URL = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/publishAdminSchedule';
  var state = { schedule: null, candidate: null, error: '', loading: false };
  function values(value) { return value && typeof value === 'object' ? Object.keys(value).map(function (key) { return value[key]; }) : []; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function groupedRows(rows) {
    var groups = {};
    values(rows).forEach(function (row) {
      var key = row.queueTripId || row.canonicalQueueTripId || row.scheduleOfferId || row.routeId || row.sourceRowId;
      if (!key) return;
      groups[key] = groups[key] || { key: key, group: row.serviceGroupId || '-', route: row.routeLabelTh || row.routeNameTh || row.routeId || '-', times: [] };
      if (row.scheduledTime || row.departureTime) groups[key].times.push(row.scheduledTime || row.departureTime);
    });
    return values(groups).sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); });
  }
  function panel() {
    var root = document.getElementById('content');
    if (!root || root.querySelector('[data-network-panel]')) return;
    var schedule = state.schedule || {}, rows = groupedRows(schedule.scheduleRows), published = schedule.publicationStatus === 'published';
    var table = rows.length ? rows.map(function (row) { return '<tr><td>' + esc(row.key) + '</td><td>' + esc(row.group) + '</td><td>' + esc(row.route) + '</td><td>' + esc(row.times.join(', ') || '-') + '</td><td><span class="status ' + (published ? 'ready' : '') + '">' + (published ? 'แสดงเมื่อเผยแพร่' : 'ไม่แสดง') + '</span></td></tr>'; }).join('') : '<tr><td colspan="5"><div class="schedule-empty"><div><strong>ไม่มีตารางที่เผยแพร่</strong><span>ถ้าไม่มี publishedSchedule ระบบจะไม่แสดงข้อมูลเก่า</span></div></div></td></tr>';
    var section = document.createElement('section'); section.className = 'card'; section.dataset.networkPanel = '1'; section.style.marginTop = '16px';
    section.innerHTML = '<div class="toolbar"><div><strong>Network Schedule Center</strong><span class="label">ใช้ publishedSchedule ชุดเดียวกับ Passenger และ Booking</span></div><div class="actions"><input type="file" accept=".json" data-network-file><button class="btn" data-network-refresh>รีเฟรช</button><button class="btn primary" data-network-publish>Publish ตาราง</button></div></div><div class="schedule-state">สถานะ: ' + (state.loading ? 'กำลังอ่านข้อมูล' : state.error || (published ? 'เผยแพร่แล้ว' : 'ไม่มีตาราง')) + ' · แถวตาราง: ' + values(schedule.scheduleRows).length + ' · เที่ยวที่แสดง: ' + rows.length + '</div><div class="table-wrap"><table class="table"><thead><tr><th>รหัสเที่ยว</th><th>กลุ่ม</th><th>เส้นทาง</th><th>เวลา</th><th>การแสดงผล</th></tr></thead><tbody>' + table + '</tbody></table></div>';
    root.appendChild(section);
  }
  function load() {
    if (!global.firebase || !global.firebase.database) { state.error = 'ยังไม่เชื่อมต่อ Firebase'; panel(); return; }
    state.loading = true; panel();
    if (!global.firebase.apps.length) { state.error = 'Firebase ยังไม่พร้อม'; state.loading = false; panel(); return; }
    global.firebase.database().ref('publishedSchedule').once('value').then(function (snap) { state.schedule = snap.val() || null; state.error = ''; state.loading = false; panel(); }).catch(function (err) { state.error = err.message || 'อ่านข้อมูลไม่ได้'; state.loading = false; panel(); });
  }
  function publish() {
    var user = global.firebase && global.firebase.auth && global.firebase.auth().currentUser;
    if (!state.candidate) { state.error = 'กรุณาเลือก Candidate JSON'; panel(); return; }
    if (!user) { state.error = 'ต้องเข้าสู่ระบบ Owner ก่อน Publish'; panel(); return; }
    user.getIdToken(true).then(function (token) { return fetch(FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(state.candidate) }); }).then(function (response) { return response.json().then(function (body) { if (!response.ok) throw new Error((body.blockers || [body.error || 'publish_failed']).join(', ')); return body; }); }).then(function (body) { state.candidate = null; state.error = ''; global.alert('เผยแพร่แล้ว รุ่น ' + body.publicationVersion); removePanel(); load(); }).catch(function (err) { state.error = err.message || 'เผยแพร่ไม่สำเร็จ'; removePanel(); panel(); });
  }
  function removePanel() { var node = document.querySelector('[data-network-panel]'); if (node) node.remove(); }
  document.addEventListener('click', function (event) { if (event.target.closest('[data-network-refresh]')) { removePanel(); load(); } if (event.target.closest('[data-network-publish]')) publish(); });
  document.addEventListener('change', function (event) { var input = event.target.closest('[data-network-file]'); if (!input || !input.files || !input.files[0]) return; var reader = new FileReader(); reader.onload = function () { try { state.candidate = JSON.parse(reader.result); state.error = 'Candidate พร้อม Publish'; removePanel(); panel(); } catch (err) { state.error = 'Candidate JSON ไม่ถูกต้อง'; removePanel(); panel(); } }; reader.readAsText(input.files[0]); });
  var observer = new MutationObserver(function () { var title = document.querySelector('#content .head h1'); if (title && /คิวรถ|ตาราง|เดินรถ/.test(title.textContent) && !document.querySelector('[data-network-panel]')) load(); });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  global.SLTransitNetworkAdmin1 = { load: load, state: state, groupedRows: groupedRows };
}(typeof window !== 'undefined' ? window : globalThis));
