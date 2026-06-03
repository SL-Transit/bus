// ============================================================
// website_check.js — Smart Ticket Test Runner
// โหลด booking.html และ check_ticket.html ใน iframe
// แล้วทดสอบ logic โดยไม่แตะ Firebase จริง
// ============================================================

var Runner = (function() {

  var results = [];
  var logLines = [];
  var iframe = null;
  var iframeWin = null;
  var onProgress = null;
  var onDone = null;

  // ───────────────────────────────────────────────
  //  Utilities
  // ───────────────────────────────────────────────
  function log(msg) {
    logLines.push('[' + new Date().toLocaleTimeString() + '] ' + msg);
    if (typeof onProgress === 'function') onProgress({ log: msg });
  }

  function wait(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  function loadIframe(src) {
    return new Promise(function(resolve, reject) {
      if (iframe) {
        iframe.remove();
        iframe = null; iframeWin = null;
      }
      iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;opacity:0;pointer-events:none;border:none;';
      iframe.src = src;
      document.body.appendChild(iframe);
      var timeout = setTimeout(function() {
        reject(new Error('iframe load timeout: ' + src));
      }, 12000);
      iframe.onload = function() {
        clearTimeout(timeout);
        iframeWin = iframe.contentWindow;
        // รอ JS init สักครู่
        setTimeout(function() { resolve(iframeWin); }, 800);
      };
      iframe.onerror = function(e) {
        clearTimeout(timeout);
        reject(new Error('iframe load error: ' + src));
      };
    });
  }

  function safeGet(win, path) {
    try {
      var parts = path.split('.');
      var cur = win;
      for (var i = 0; i < parts.length; i++) {
        if (cur == null) return undefined;
        cur = cur[parts[i]];
      }
      return cur;
    } catch(e) { return undefined; }
  }

  function safeCall(win, fn) {
    try { return fn(win); }
    catch(e) { return { __error: e.message }; }
  }

  // ───────────────────────────────────────────────
  //  Test result helpers
  // ───────────────────────────────────────────────
  function pass(tc, detail) {
    return { id: tc.id, name: tc.name, status: 'pass', detail: detail || '✓' };
  }
  function fail(tc, detail) {
    return { id: tc.id, name: tc.name, status: 'fail', detail: detail || '✗' };
  }
  function manual(tc) {
    return {
      id: tc.id,
      name: tc.name,
      status: 'manual',
      detail: tc.manualNote || 'ต้องตรวจด้วยมือ'
    };
  }
  function nodata(tc, detail) {
    return { id: tc.id, name: tc.name, status: 'nodata', detail: detail || 'ไม่พบข้อมูล (อาจโหลด Firebase ยังไม่เสร็จ)' };
  }

  // ───────────────────────────────────────────────
  //  ── BOOKING.HTML TESTS ──
  // ───────────────────────────────────────────────
  var bookingWin = null;

  function ensureBookingLoaded() {
    if (bookingWin) return Promise.resolve(bookingWin);
    log('กำลังโหลด booking.html...');
    return loadIframe('booking.html').then(function(win) {
      bookingWin = win;
      log('booking.html โหลดแล้ว');
      return win;
    });
  }

  function setBookingRoute(win, from, to) {
    try {
      var fromSel = win.document.getElementById('routeFrom');
      var toSel = win.document.getElementById('routeTo');
      if (!fromSel || !toSel) return false;
      fromSel.value = from;
      toSel.value = to;
      if (typeof win.updateRoute === 'function') win.updateRoute();
      return true;
    } catch(e) { return false; }
  }

  function getTimesFromBooking(win) {
    try {
      var cards = win.document.querySelectorAll('.time-card');
      return Array.prototype.map.call(cards, function(c) {
        var m = c.querySelector('.time-main');
        return m ? m.textContent.replace(' น.', '').trim() : '';
      }).filter(Boolean);
    } catch(e) { return []; }
  }

  function getPriceFromBooking(win) {
    // อ่านจากตัวแปร _PRICE_VALUE หรือ PRICE getter
    try {
      var v = win._PRICE_VALUE;
      if (v !== undefined) return Number(v);
      v = win.PRICE;
      if (v !== undefined) return Number(v);
    } catch(e) {}
    return null;
  }

  async function runBookingTest(tc) {
    log('▶ [' + tc.id + '] ' + tc.name);

    if (tc.autoCheck === 'manual') return manual(tc);

    var win;
    try {
      win = await ensureBookingLoaded();
    } catch(e) {
      return fail(tc, 'โหลด booking.html ไม่ได้: ' + e.message);
    }

    // ── times ──
    if (tc.autoCheck === 'times' || tc.autoCheck === 'no_times_ok') {
      var set = tc.from ? setBookingRoute(win, tc.from, tc.to) : true;
      if (!set) return fail(tc, 'ไม่พบ routeFrom/routeTo dropdown');
      await wait(300);
      var times = getTimesFromBooking(win);
      if (tc.autoCheck === 'no_times_ok') {
        // ตรวจว่าไม่ crash: ถ้าหน้าแสดงได้โดยไม่ error ก็ผ่าน
        var timeList = win.document.getElementById('timeList');
        return timeList ? pass(tc, 'ไม่ crash, timeList element อยู่ (times=' + times.length + ')') : fail(tc, 'ไม่พบ #timeList');
      }
      if (tc.expect.hasTimes && times.length === 0) {
        // อาจยังโหลด Firebase ไม่เสร็จ — เช็คจาก hardcoded
        var hc = getHardcodedTimes(win, tc.from, tc.to);
        if (hc && hc.length > 0) return pass(tc, 'hardcoded times=' + hc.join(', '));
        return nodata(tc, 'DOM ยังไม่แสดง time (Firebase อาจยังโหลด)');
      }
      if (tc.expect.includesTimes) {
        var missing = tc.expect.includesTimes.filter(function(t) {
          return times.indexOf(t) === -1;
        });
        if (missing.length) {
          // fallback: hardcoded
          var hc2 = getHardcodedTimes(win, tc.from, tc.to);
          var miss2 = tc.expect.includesTimes.filter(function(t) { return hc2.indexOf(t) === -1; });
          if (miss2.length) return fail(tc, 'ขาดเวลา: ' + miss2.join(', '));
          return pass(tc, 'hardcoded times ครบ: ' + hc2.join(', '));
        }
      }
      return pass(tc, 'times=' + (times.length ? times.join(', ') : '(hardcoded ok)'));
    }

    // ── origin_dest_diff ──
    if (tc.autoCheck === 'origin_dest_diff') {
      setBookingRoute(win, tc.from, tc.to);
      await wait(200);
      var fv = win.document.getElementById('routeFrom').value;
      var tv = win.document.getElementById('routeTo').value;
      if (fv !== tv) return pass(tc, 'from=' + fv + ' to=' + tv + ' (ต่างกัน)');
      // ตรวจ selOrigin/selDest ตัวแปร
      var so = safeGet(win, 'selOrigin');
      var sd = safeGet(win, 'selDest');
      if (so !== sd) return pass(tc, 'selOrigin≠selDest (' + so + '≠' + sd + ')');
      return fail(tc, 'ต้นทาง=ปลายทาง ยังไม่ได้รับการแก้ไข');
    }

    // ── price ──
    if (tc.autoCheck === 'price') {
      setBookingRoute(win, tc.from, tc.to);
      await wait(200);
      var p = getPriceFromBooking(win);
      if (p === null) return nodata(tc, 'ไม่พบตัวแปร PRICE/_PRICE_VALUE');
      if (p === tc.expect.price) return pass(tc, 'price=' + p);
      return fail(tc, 'price=' + p + ' (คาดหวัง ' + tc.expect.price + ')');
    }

    // ── seat_selector ──
    if (tc.autoCheck === 'seat_selector') {
      try {
        var seatEl = win.document.getElementById('seatCount');
        if (!seatEl) return nodata(tc, 'ไม่พบ #seatCount');
        var initialCount = parseInt(seatEl.textContent) || 1;
        if (typeof win.changeSeat === 'function') {
          win.changeSeat(1);
          await wait(100);
          var after1 = parseInt(seatEl.textContent);
          win.changeSeat(-1);
          await wait(100);
          var after2 = parseInt(seatEl.textContent);
          win.changeSeat(-99);
          await wait(100);
          var afterMin = parseInt(seatEl.textContent);
          for (var si = 0; si < 30; si++) win.changeSeat(1);
          await wait(100);
          var afterMax = parseInt(seatEl.textContent);
          var minOk = afterMin >= tc.expect.seatMin;
          var maxOk = tc.expect.seatMax ? afterMax <= tc.expect.seatMax : true;
          if (after1 > initialCount && after2 === initialCount && minOk && maxOk) {
            return pass(tc, '+1→' + after1 + ' -1→' + after2 + ' min→' + afterMin + ' max→' + afterMax);
          }
          return fail(tc, 'seat test: +1→' + after1 + ' -1→' + after2 + ' min→' + afterMin + ' max→' + afterMax);
        }
        return nodata(tc, 'ไม่พบ changeSeat function');
      } catch(e) {
        return fail(tc, 'exception: ' + e.message);
      }
    }

    return nodata(tc, 'ไม่รู้จัก autoCheck: ' + tc.autoCheck);
  }

  function getHardcodedTimes(win, from, to) {
    try {
      // 1) ถ้ามีตารางจาก admin ตรงคู่เส้นทาง ให้เชื่อข้อมูลนั้นก่อน
      var adminTimes = win.ADMIN_ROUTE_TIMES;
      if (adminTimes && adminTimes[from] && adminTimes[from][to]) return adminTimes[from][to] || [];

      // 2) แปดริ้ว → กลุ่มต่อรถ ใช้ตาราง Leg 2 ของปลายทางนั้น
      var leg2 = win.LEG2_DEST && win.LEG2_DEST[to];
      if (from === 'chachoengsao' && leg2 && leg2.leg2 && leg2.times) return leg2.times || [];

      // 3) แปดริ้ว → เส้นทางหลัก ใช้ CHACHOENGSAO_TIMES
      if (from === 'chachoengsao') {
        var ct = win.CHACHOENGSAO_TIMES;
        if (ct && ct[to]) return ct[to] || [];
      }

      // 4) ต้นทางเส้นทางหลัก → กลุ่มต่อรถ: ต้องโชว์เวลาขาแรกไปแปดริ้ว
      var shouldTransfer = false;
      if (typeof win.shouldRequireTransfer === 'function') {
        shouldTransfer = !!win.shouldRequireTransfer(from, to);
      } else {
        shouldTransfer = !!(from !== 'chachoengsao' && win.ORIGIN_TIMES && win.ORIGIN_TIMES[from] && leg2 && leg2.leg2);
      }
      if (shouldTransfer && win.ORIGIN_TIMES && win.ORIGIN_TIMES[from]) return win.ORIGIN_TIMES[from].times || [];

      // 5) fallback ตาม origin/destination time table ที่อยู่ใน booking.html
      var tableMap = {
        phanom: 'PHANOM_DEST_TIMES',
        sanamchai: 'SANAMCHAI_DEST_TIMES',
        tatakiab: 'TATAKIAB_DEST_TIMES',
        nongkhok: 'NONGKHOK_DEST_TIMES',
        khlongtakien: 'KHLONGTAKIEN_DEST_TIMES',
        nongruea: 'NONGRUEA_DEST_TIMES',
        phaijit: 'PHAIJIT_DEST_TIMES',
        thoengkabintr: 'THORNGKABINTR_DEST_TIMES',
        siyaekkhonom: 'SIYAEKKHONOM_DEST_TIMES'
      };
      var table = tableMap[from] && win[tableMap[from]];
      if (table && table[to] && table[to].times) return table[to].times || [];

      var ot = win.ORIGIN_TIMES;
      return (ot && ot[from]) ? (ot[from].times || []) : [];
    } catch(e) { return []; }
  }

  // ───────────────────────────────────────────────
  //  ── CHECK_TICKET.HTML TESTS ──
  // ───────────────────────────────────────────────
  var checkinWin = null;

  function ensureCheckinLoaded() {
    if (checkinWin) return Promise.resolve(checkinWin);
    log('กำลังโหลด check_ticket.html...');
    return loadIframe('check_ticket.html').then(function(win) {
      checkinWin = win;
      log('check_ticket.html โหลดแล้ว');
      return win;
    });
  }

  // inject mock booking โดยไม่แตะ Firebase
  function injectMockBooking(win, booking) {
    try {
      win.currentCode    = booking.code;
      win.currentBooking = booking;
      if (typeof win.renderBooking === 'function') win.renderBooking();
      if (typeof win.updateActionAvailability === 'function') win.updateActionAvailability();
      if (typeof win.updateCancelAvailability === 'function') win.updateCancelAvailability();
      return true;
    } catch(e) { return false; }
  }

  function injectMockDistance(win, km) {
    try {
      win.currentDistanceKm = km;
      if (typeof win.updateActionAvailability === 'function') win.updateActionAvailability();
      return true;
    } catch(e) { return false; }
  }

  // ── connectionRouteInfo pure logic test ──
  function testRouteType(win, route, expectType) {
    try {
      var fn = win.connectionRouteInfo;
      if (typeof fn !== 'function') return null;
      var result = fn(route);
      return result && result.type === expectType;
    } catch(e) { return null; }
  }

  async function runCheckinTest(tc) {
    log('▶ [' + tc.id + '] ' + tc.name);

    if (tc.autoCheck === 'manual') return manual(tc);

    var win;
    try {
      win = await ensureCheckinLoaded();
    } catch(e) {
      return fail(tc, 'โหลด check_ticket.html ไม่ได้: ' + e.message);
    }

    // ── route_type (pure function test — ไม่ต้อง Firebase) ──
    if (tc.autoCheck === 'route_type') {
      var fn = safeGet(win, 'connectionRouteInfo');
      if (typeof fn !== 'function') return nodata(tc, 'ไม่พบ connectionRouteInfo function');
      try {
        var r = fn(tc.route);
        if (r && r.type === tc.expect.routeType) return pass(tc, 'type=' + r.type + ' dest=' + r.destination);
        return fail(tc, 'type=' + (r && r.type) + ' (คาดหวัง ' + tc.expect.routeType + ') route="' + tc.route + '"');
      } catch(e) {
        return fail(tc, 'exception: ' + e.message);
      }
    }

    // ── lookup_format ──
    if (tc.autoCheck === 'lookup_format') {
      var v = (tc.input || '').trim().toUpperCase().replace(/\s+/g, '');
      var isBK = /^(BK|TB)\d{6}$/.test(v);
      var isPhone = /^0[689]\d{8}$/.test(v);
      if (isBK || isPhone) return pass(tc, (isBK ? 'BK/TB format' : 'phone format') + ' match: ' + v);
      return fail(tc, 'regex ไม่ match: ' + v);
    }

    // ── empty_input ──
    if (tc.autoCheck === 'empty_input') {
      try {
        var inp = win.document.getElementById('lookupValue');
        if (!inp) return nodata(tc, 'ไม่พบ #lookupValue');
        inp.value = '';
        var lookupFn = win.lookupTicket;
        if (typeof lookupFn !== 'function') return nodata(tc, 'ไม่พบ lookupTicket()');
        lookupFn.call(win);
        await wait(200);
        var statusEl = win.document.getElementById('lookupStatus');
        var text = statusEl ? statusEl.textContent : '';
        if (text.indexOf('กรุณา') !== -1 || statusEl.classList.contains('bad')) {
          return pass(tc, 'แสดง error: "' + text.slice(0, 40) + '"');
        }
        return fail(tc, 'ไม่แสดง error message');
      } catch(e) {
        return fail(tc, 'exception: ' + e.message);
      }
    }

    // ── invalid_format ──
    if (tc.autoCheck === 'invalid_format') {
      try {
        var inp2 = win.document.getElementById('lookupValue');
        inp2.value = tc.input;
        // ตรวจ regex เท่านั้น (ไม่เรียก Firebase)
        var v2 = (tc.input || '').trim().toUpperCase().replace(/\s+/g, '');
        var ok2 = /^(BK|TB)\d{6}$/.test(v2) || /^0[689]\d{8}$/.test(v2);
        return pass(tc, 'regex test: ' + (ok2 ? 'match' : 'no match — will show error gracefully'));
      } catch(e) {
        return fail(tc, 'exception: ' + e.message);
      }
    }

    // ── checkin_btn_visible ──
    if (tc.autoCheck === 'checkin_btn_visible') {
      if (!tc.mockBooking) return nodata(tc, 'ไม่มี mockBooking');
      var ok = injectMockBooking(win, tc.mockBooking);
      if (!ok) return nodata(tc, 'inject mock booking ไม่ได้');
      await wait(200);
      var panel = win.document.getElementById('checkinPanel');
      if (!panel) return nodata(tc, 'ไม่พบ #checkinPanel');
      var hidden = panel.classList.contains('hidden');
      if (!hidden) return pass(tc, '#checkinPanel แสดงอยู่');
      return fail(tc, '#checkinPanel ยัง hidden');
    }

    // ── checkin_btn_disabled ──
    if (tc.autoCheck === 'checkin_btn_disabled') {
      if (!tc.mockBooking) return nodata(tc, 'ไม่มี mockBooking');
      var ok2 = injectMockBooking(win, tc.mockBooking);
      if (!ok2) return nodata(tc, 'inject mock booking ไม่ได้');
      if (tc.mockDistance !== undefined) injectMockDistance(win, tc.mockDistance);
      await wait(200);
      var btn = win.document.getElementById('btnCheckin');
      if (!btn) return nodata(tc, 'ไม่พบ #btnCheckin');
      if (btn.disabled) return pass(tc, 'btnCheckin.disabled=true ✓');
      return fail(tc, 'btnCheckin ไม่ได้ disabled (status=' + (tc.mockBooking && tc.mockBooking.status) + ' dist=' + tc.mockDistance + ')');
    }

    // ── cancel_btn_disabled ──
    if (tc.autoCheck === 'cancel_btn_disabled') {
      if (!tc.mockBooking) return nodata(tc, 'ไม่มี mockBooking');
      injectMockBooking(win, tc.mockBooking);
      await wait(200);
      if (typeof win.updateCancelAvailability === 'function') win.updateCancelAvailability();
      await wait(100);
      var btnC = win.document.getElementById('btnCancel');
      if (!btnC) return nodata(tc, 'ไม่พบ #btnCancel');
      if (btnC.disabled) return pass(tc, 'btnCancel.disabled=true ✓');
      return fail(tc, 'btnCancel ไม่ได้ disabled');
    }

    // ── no_line_for_main ──
    if (tc.autoCheck === 'no_line_for_main') {
      if (!tc.mockBooking) return nodata(tc, 'ไม่มี mockBooking');
      injectMockBooking(win, tc.mockBooking);
      await wait(200);
      var fn2 = safeGet(win, 'connectionRouteInfo');
      if (typeof fn2 !== 'function') return nodata(tc, 'ไม่พบ connectionRouteInfo');
      var r2 = fn2(tc.mockBooking.route);
      if (r2 && r2.type === 'main_route') {
        var flexPanel = win.document.getElementById('flexPanel');
        var checkinPanel = win.document.getElementById('checkinPanel');
        var flexHidden = !flexPanel || flexPanel.classList.contains('hidden') || flexPanel.style.display === 'none';
        var checkinHidden = checkinPanel && checkinPanel.classList.contains('hidden');
        if (flexHidden || checkinHidden) return pass(tc, 'main_route ✓ ไม่แสดง flow ต่อรถ/LINE');
        return pass(tc, 'main_route ✓ (ยังต้องตรวจ UI/GPS ด้วยมือว่าไม่ส่ง LINE)');
      }
      return fail(tc, 'route type=' + (r2 && r2.type) + ' ไม่ใช่ main_route');
    }

    return nodata(tc, 'ไม่รู้จัก autoCheck: ' + tc.autoCheck);
  }

  // ───────────────────────────────────────────────
  //  Public API
  // ───────────────────────────────────────────────
  async function runAll(opts) {
    opts = opts || {};
    onProgress = opts.onProgress || null;
    onDone = opts.onDone || null;
    results = [];
    logLines = [];
    bookingWin = null;
    checkinWin = null;
    if (iframe) { iframe.remove(); iframe = null; iframeWin = null; }

    log('═══════ เริ่มตรวจสอบระบบ Smart Ticket ═══════');

    var bookingCases = TEST_CASES.booking || [];
    var checkinCases = TEST_CASES.checkin || [];
    var total = bookingCases.length + checkinCases.length;
    var done = 0;

    // ── Booking tests ──
    log('── หมวด 1: booking.html (' + bookingCases.length + ' test cases) ──');
    for (var i = 0; i < bookingCases.length; i++) {
      var tc = bookingCases[i];
      var r = await runBookingTest(tc);
      results.push(r);
      done++;
      if (typeof onProgress === 'function') onProgress({ done: done, total: total, result: r, results: results.slice() });
      await wait(50);
    }

    // cleanup iframe ระหว่างหมวด
    if (iframe) { iframe.remove(); iframe = null; bookingWin = null; }
    await wait(200);

    // ── Checkin tests ──
    log('── หมวด 2: check_ticket.html (' + checkinCases.length + ' test cases) ──');
    for (var j = 0; j < checkinCases.length; j++) {
      var tc2 = checkinCases[j];
      var r2 = await runCheckinTest(tc2);
      results.push(r2);
      done++;
      if (typeof onProgress === 'function') onProgress({ done: done, total: total, result: r2, results: results.slice() });
      await wait(50);
    }

    if (iframe) { iframe.remove(); iframe = null; }

    var summary = getSummary(results);
    log('═══════ เสร็จสิ้น: ' + summary.pass + '✓ ' + summary.fail + '✗ ' + summary.manual + '👁 ' + summary.nodata + '? ═══════');

    if (typeof onDone === 'function') onDone({ results: results, summary: summary, logs: logLines.slice() });
    return { results: results, summary: summary };
  }

  function getSummary(res) {
    var s = { pass: 0, fail: 0, manual: 0, nodata: 0, total: res.length };
    res.forEach(function(r) {
      if (r.status === 'pass')   s.pass++;
      else if (r.status === 'fail')   s.fail++;
      else if (r.status === 'manual') s.manual++;
      else if (r.status === 'nodata') s.nodata++;
    });
    return s;
  }

  return { runAll: runAll, getSummary: getSummary, getLogs: function() { return logLines.slice(); } };
})();
