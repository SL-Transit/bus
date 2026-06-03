(function() {
  'use strict';

  var state = {
    running: false,
    results: {},
    htmlCache: {},
    currentFrame: null
  };

  var groups = [
    {
      id: 'booking',
      title: 'booking.html - จำลองการจองหลายรูปแบบ',
      file: 'booking.html',
      cases: [
        {
          id: 'BK-01',
          name: 'แปดริ้วไปสนามชัย 1 ที่นั่ง',
          from: 'chachoengsao',
          to: 'sanamchai',
          seats: 1,
          expectedFare: 55,
          expectTransfer: false,
          expectTimes: ['09:40', '14:00', '17:20']
        },
        {
          id: 'BK-02',
          name: 'สนามชัยไปแปดริ้ว 2 ที่นั่ง',
          from: 'sanamchai',
          to: 'chachoengsao',
          seats: 2,
          expectedFare: 55,
          expectTransfer: false,
          expectTimes: ['06:20', '09:00', '14:00']
        },
        {
          id: 'BK-03',
          name: 'พนมสารคามไปสนามชัย ใช้ราคาช่วงทาง',
          from: 'phanom',
          to: 'sanamchai',
          seats: 3,
          expectedFare: 35,
          expectTransfer: false
        },
        {
          id: 'BK-04',
          name: 'แปดริ้วไปพัทยา มีเที่ยวต่อรถและราคารวม Leg 2',
          from: 'chachoengsao',
          to: 'pattaya',
          seats: 1,
          expectedFare: 140,
          expectTransfer: true,
          expectTimes: ['05:40', '11:20', '17:00']
        },
        {
          id: 'BK-05',
          name: 'สนามชัยไปพัทยา 2 ที่นั่ง ต้องบวกค่า Leg 1 + Leg 2',
          from: 'sanamchai',
          to: 'pattaya',
          seats: 2,
          expectedFare: 195,
          expectTransfer: true
        },
        {
          id: 'BK-06',
          name: 'แปดริ้วไปเอกมัย ใช้ตาราง Leg 2 เฉพาะกลุ่มเอกมัย',
          from: 'chachoengsao',
          to: 'ekkamai',
          seats: 1,
          expectedFare: 120,
          expectTransfer: true,
          expectTimes: ['06:30', '10:30', '17:30']
        },
        {
          id: 'BK-07',
          name: 'แปดริ้วไปมีนบุรี ใช้ตารางมีนบุรี',
          from: 'chachoengsao',
          to: 'minburi',
          seats: 1,
          expectedFare: 70,
          expectTransfer: true,
          expectTimes: ['04:00', '09:40', '16:20']
        }
      ]
    },
    {
      id: 'ticket',
      title: 'check_ticket.html - ตรวจหน้าตั๋วจาก booking mock',
      file: 'check_ticket.html',
      cases: [
        {
          id: 'CT-01',
          name: 'ตั๋วเส้นทางหลักไม่แสดง Leg 2',
          booking: {
            code: 'TB100001',
            name: 'คุณทดสอบ เส้นทางหลัก',
            phone: '0811111111',
            route: 'ฉะเชิงเทรา (แปดริ้ว) → ท่ารถสนามชัยเขต',
            origin: 'ฉะเชิงเทรา (แปดริ้ว)',
            destination: 'ท่ารถสนามชัยเขต',
            date: futureDate(4),
            time: '09:00',
            seats: 1,
            price: 55,
            status: 'confirmed',
            testMode: true
          },
          expectLeg2: false,
          expectedPrice: 55
        },
        {
          id: 'CT-02',
          name: 'ตั๋วต่อรถแสดง Leg 1, Leg 2 และเวลาต่อรถ',
          booking: {
            code: 'TB100002',
            name: 'คุณทดสอบ ต่อรถ',
            phone: '0822222222',
            route: 'ท่ารถสนามชัยเขต → ฉะเชิงเทรา (แปดริ้ว) → พัทยา',
            origin: 'ท่ารถสนามชัยเขต',
            destination: 'พัทยา',
            date: futureDate(5),
            time: '06:20',
            leg2Time: '08:20',
            seats: 2,
            price: 390,
            status: 'confirmed',
            testMode: true
          },
          expectLeg2: true,
          expectedPrice: 390
        },
        {
          id: 'CT-03',
          name: 'ตั๋วที่เช็คอินแล้วล็อกปุ่มเช็คอิน',
          booking: {
            code: 'TB100003',
            name: 'คุณทดสอบ เช็คอินแล้ว',
            phone: '0833333333',
            route: 'แปดริ้ว → เอกมัย',
            origin: 'ฉะเชิงเทรา (แปดริ้ว)',
            destination: 'เอกมัย',
            date: futureDate(6),
            time: '08:30',
            leg2Time: '08:30',
            seats: 1,
            price: 120,
            status: 'checked_in',
            testMode: true
          },
          expectLeg2: true,
          expectedPrice: 120,
          expectCheckinDisabled: true
        },
        {
          id: 'CT-04',
          name: 'ตั๋วยกเลิกแล้วแสดงสถานะยกเลิกและปิดปุ่ม',
          booking: {
            code: 'TB100004',
            name: 'คุณทดสอบ ยกเลิก',
            phone: '0844444444',
            route: 'ฉะเชิงเทรา (แปดริ้ว) → ตลาดมีนบุรี',
            origin: 'ฉะเชิงเทรา (แปดริ้ว)',
            destination: 'ตลาดมีนบุรี',
            date: futureDate(7),
            time: '07:40',
            leg2Time: '07:40',
            seats: 1,
            price: 70,
            status: 'cancelled',
            testMode: true
          },
          expectLeg2: true,
          expectedPrice: 70,
          expectCancelDisabled: true
        }
      ]
    },
    {
      id: 'passenger',
      title: 'passenger.html - ตรวจตารางและเส้นทางที่ผู้โดยสารเห็น',
      file: 'passenger.html',
      cases: [
        {
          id: 'PS-01',
          name: 'เส้นทางหลักสนามชัยไปแปดริ้วแสดงตารางเวลา',
          origin: 'ท่ารถสนามชัยเขต',
          destination: 'ฉะเชิงเทรา (แปดริ้ว)',
          expectLeg2: false,
          expectedTimes: ['06:20', '09:00', '14:00']
        },
        {
          id: 'PS-02',
          name: 'แปดริ้วไปพัทยาแสดงตารางต่อรถ',
          origin: 'ฉะเชิงเทรา (แปดริ้ว)',
          destination: 'พัทยา',
          expectLeg2: true,
          expectedTimes: ['05:40', '11:20', '17:00']
        },
        {
          id: 'PS-03',
          name: 'สนามชัยไปเอกมัยแสดง Leg 1 และ Leg 2',
          origin: 'ท่ารถสนามชัยเขต',
          destination: 'เอกมัย',
          expectLeg2: true,
          expectedTimes: ['06:30', '10:30', '17:30']
        },
        {
          id: 'PS-04',
          name: 'แปดริ้วไปมีนบุรีแสดงตารางเฉพาะมีนบุรี',
          origin: 'ฉะเชิงเทรา (แปดริ้ว)',
          destination: 'ตลาดมีนบุรี',
          expectLeg2: true,
          expectedTimes: ['04:00', '09:40', '16:20']
        }
      ]
    }
  ];

  function futureDate(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function byId(id) { return document.getElementById(id); }

  function init() {
    renderCases();
    updateStats();
    byId('runAllBtn').addEventListener('click', function() { runGroups(groups.map(function(g) { return g.id; })); });
    byId('runBookingBtn').addEventListener('click', function() { runGroups(['booking']); });
    byId('runTicketBtn').addEventListener('click', function() { runGroups(['ticket']); });
    byId('runPassengerBtn').addEventListener('click', function() { runGroups(['passenger']); });
    byId('clearBtn').addEventListener('click', clearResults);
    log('พร้อมตรวจทาน');
    var params = new URLSearchParams(location.search);
    if (params.get('autorun') === '1') {
      var group = params.get('group');
      setTimeout(function() {
        runGroups(group ? [group] : groups.map(function(g) { return g.id; }));
      }, 250);
    }
  }

  function renderCases() {
    var root = byId('caseGroups');
    root.innerHTML = groups.map(function(group) {
      return '<section class="group">' +
        '<div class="group-head">' +
          '<div class="group-title">' + esc(group.title) + '</div>' +
          '<div class="group-count">' + group.cases.length + ' cases</div>' +
        '</div>' +
        group.cases.map(function(tc) {
          return '<div class="case" id="case-' + tc.id + '">' +
            '<div class="case-id">' + esc(tc.id) + '</div>' +
            '<div><div class="case-name">' + esc(tc.name) + '</div><div class="case-detail" data-detail>รอรัน</div></div>' +
            '<div class="badge" data-status>WAIT</div>' +
          '</div>';
        }).join('') +
      '</section>';
    }).join('');
  }

  function clearResults() {
    state.results = {};
    groups.forEach(function(group) {
      group.cases.forEach(function(tc) { setCase(tc.id, 'wait', 'รอรัน'); });
    });
    byId('log').textContent = '';
    updateStats();
  }

  async function runGroups(ids) {
    if (state.running) return;
    state.running = true;
    setButtons(false);
    try {
      for (var i = 0; i < ids.length; i++) {
        var group = groups.find(function(g) { return g.id === ids[i]; });
        if (!group) continue;
        log('เริ่มกลุ่ม ' + group.title);
        for (var j = 0; j < group.cases.length; j++) {
          await runCase(group, group.cases[j]);
        }
      }
    } finally {
      state.running = false;
      setButtons(true);
      log('จบรอบตรวจทาน');
    }
  }

  async function runCase(group, tc) {
    setCase(tc.id, 'run', 'กำลังรัน...');
    try {
      var frame = await loadTarget(group.file);
      if (group.id === 'booking') await runBookingCase(frame.contentWindow, tc);
      if (group.id === 'ticket') await runTicketCase(frame.contentWindow, tc);
      if (group.id === 'passenger') await runPassengerCase(frame.contentWindow, tc);
      setCase(tc.id, 'pass', 'ผ่าน');
      log('PASS ' + tc.id + ' ' + tc.name);
    } catch (err) {
      setCase(tc.id, 'fail', err.message || String(err));
      log('FAIL ' + tc.id + ' ' + (err.message || err));
    }
  }

  async function loadTarget(file) {
    byId('previewTitle').textContent = file;
    var frame = byId('targetFrame');
    var html = await getRewrittenHtml(file);
    frame.srcdoc = html;
    await new Promise(function(resolve, reject) {
      var done = false;
      var timer = setTimeout(function() {
        if (!done) reject(new Error('โหลด ' + file + ' นานเกินไป'));
      }, 12000);
      frame.onload = function() {
        done = true;
        clearTimeout(timer);
        resolve();
      };
    });
    state.currentFrame = frame;
    await sleep(650);
    var win = frame.contentWindow;
    win.alert = function(msg) { win.__reviewAlerts.push(String(msg)); };
    return frame;
  }

  async function getRewrittenHtml(file) {
    if (!state.htmlCache[file]) {
      var res = await fetch(file + '?review=' + Date.now());
      if (!res.ok) throw new Error('อ่านไฟล์ไม่ได้: ' + file);
      state.htmlCache[file] = await res.text();
    }
    return rewriteHtml(state.htmlCache[file], file);
  }

  function rewriteHtml(html, file) {
    var stripped = html
      .replace(/<script\b[^>]*src=["'][^"']*firebase[^"']*["'][^>]*>\s*<\/script>/gi, '')
      .replace(/<script\b[^>]*src=["'][^"']*longdo[^"']*["'][^>]*>\s*<\/script>/gi, '');
    var mock = '<script>' + makeMockScript(file) + '<\/script>';
    if (stripped.indexOf('</head>') !== -1) {
      return stripped.replace('</head>', mock + '</head>');
    }
    return mock + stripped;
  }

  function makeMockScript(file) {
    return [
      'window.__reviewMode=true;',
      'window.__reviewAlerts=[];',
      'window.__reviewDb={};',
      'window.alert=function(msg){window.__reviewAlerts.push(String(msg));};',
      'function __snap(value){return {val:function(){return value||null;},exists:function(){return value!==null&&value!==undefined;},forEach:function(cb){var v=value||{};Object.keys(v).forEach(function(k){cb({key:k,val:function(){return v[k];},exists:function(){return true;}});});}};}',
      'function __ref(path){var api={path:path,orderByChild:function(){return api;},equalTo:function(){return api;},limitToLast:function(){return api;},once:function(){return Promise.resolve(__snap(null));},on:function(evt,cb){setTimeout(function(){cb(__snap(null));},0);return api;},off:function(){return api;},set:function(v){window.__reviewDb[path]=v;return Promise.resolve();},update:function(v){window.__reviewDb[path]=Object.assign(window.__reviewDb[path]||{},v);return Promise.resolve();},push:function(v){var k="mock_"+Date.now()+"_"+Math.random().toString(36).slice(2,6);window.__reviewDb[path+"/"+k]=v||{};return {key:k,set:function(next){window.__reviewDb[path+"/"+k]=next;return Promise.resolve();}};},transaction:function(fn){var next=fn(window.__reviewDb[path]||0);window.__reviewDb[path]=next;return Promise.resolve({committed:true,snapshot:__snap(next)});}};return api;}',
      'window.firebase={initializeApp:function(){return {};},database:function(){return {ref:__ref,ServerValue:{TIMESTAMP:Date.now()}};},auth:function(){return {signInAnonymously:function(){return Promise.resolve({user:{uid:"review-user"}});},currentUser:{uid:"review-user"}};}};',
      'window.firebase.database.ServerValue={TIMESTAMP:Date.now()};',
      'window.longdo={Map:function(){return {Overlays:{add:function(){},remove:function(){},clear:function(){}},location:function(){},zoom:function(){},Route:{},Event:{bind:function(){}}};},Marker:function(){return {};},Polyline:function(){return {};},LatLng:function(lat,lon){return {lat:lat,lon:lon,lng:lon};},OverlayWeight:{Top:1}};',
      'navigator.geolocation={getCurrentPosition:function(ok){setTimeout(function(){ok({coords:{latitude:13.692383,longitude:101.054183,speed:0}});},0);},watchPosition:function(ok){setTimeout(function(){ok({coords:{latitude:13.692383,longitude:101.054183,speed:0}});},0);return 1;},clearWatch:function(){}};',
      'window.fetch=function(url){return Promise.resolve({ok:true,json:function(){return Promise.resolve({routes:[{geometry:{coordinates:[]}}]});},text:function(){return Promise.resolve("");}});};',
      'console.log("[review mock loaded]", ' + JSON.stringify(file) + ');'
    ].join('');
  }

  async function runBookingCase(win, tc) {
    await waitFor(function() { return win.document.getElementById('routeFrom') && win.document.getElementById('timeList'); }, 6000, 'booking form ไม่พร้อม');
    setSelect(win, 'routeFrom', tc.from);
    setSelect(win, 'routeTo', tc.to);
    setInput(win, 'travelDate', futureDate(3));
    callIf(win, 'updateRoute');
    callIf(win, 'renderTimes');
    await sleep(250);

    var timeListText = win.document.getElementById('timeList').textContent || '';
    assert((win.document.querySelectorAll('.time-card').length > 0), 'ตารางเวลาไม่ขึ้น');
    (tc.expectTimes || []).forEach(function(t) {
      assert(timeListText.indexOf(t) !== -1, 'ไม่พบเวลา ' + t + ' ในตาราง');
    });

    var pickedTime = pickTime(win);
    assert(pickedTime, 'เลือกเวลาไม่ได้');
    for (var s = 1; s < tc.seats; s++) {
      click(win.document.querySelectorAll('.seat-btn')[1]);
      await sleep(70);
    }
    assert(text(win, 'seatCount') === String(tc.seats), 'จำนวนที่นั่งไม่ตรง');

    callIf(win, 'goPage', 2);
    await waitFor(function() { return win.document.getElementById('page2').classList.contains('active'); }, 5000, 'ไปหน้าข้อมูลผู้โดยสารไม่ได้');
    setInput(win, 'pName', 'คุณตรวจทาน ระบบ');
    setInput(win, 'pPhone', '0891234567');
    await sleep(100);

    var summary = text(win, 'sumTotal') + ' ' + text(win, 'sumSeat') + ' ' + text(win, 'sumTime');
    assert(summary.indexOf(String(tc.expectedFare * tc.seats)) !== -1, 'ราคาไม่ตรง คาด ' + (tc.expectedFare * tc.seats) + ' แต่เห็น ' + summary);
    assert(summary.indexOf(String(tc.seats)) !== -1, 'summary จำนวนที่นั่งไม่ตรง');
    assert(summary.indexOf(pickedTime) !== -1, 'summary เวลาไม่ตรง');

    var leg2Card = win.document.getElementById('leg2SummaryCard');
    var leg2Visible = leg2Card && isVisible(leg2Card);
    assert(leg2Visible === tc.expectTransfer, tc.expectTransfer ? 'ควรมีสรุปต่อรถแต่ไม่แสดง' : 'ไม่ควรมีสรุปต่อรถ');

    callIf(win, 'goPage', 3);
    await waitFor(function() { return win.document.getElementById('page3').classList.contains('active'); }, 6000, 'ไปหน้าชำระเงินไม่ได้');
    assert(text(win, 'sumTotal2').indexOf(String(tc.expectedFare * tc.seats)) !== -1, 'ยอดชำระหน้าสุดท้ายไม่ตรง');
  }

  function pickTime(win) {
    var cards = Array.prototype.slice.call(win.document.querySelectorAll('.time-card'));
    var card = cards.find(function(el) { return !el.classList.contains('closed') && isVisible(el); });
    if (!card) return '';
    var time = (card.querySelector('.time-main') || card).textContent.trim().match(/\d{2}:\d{2}/);
    click(card);
    return time ? time[0] : '';
  }

  async function runTicketCase(win, tc) {
    await waitFor(function() { return typeof win.renderBooking === 'function' && win.document.getElementById('ticketPanel'); }, 6000, 'ticket page ไม่พร้อม');
    win.currentBooking = Object.assign({}, tc.booking);
    win.currentCode = tc.booking.code;
    callIf(win, 'renderBooking');
    await sleep(200);

    assert(!win.document.getElementById('ticketPanel').classList.contains('hidden'), 'ticket panel ไม่แสดง');
    assert(text(win, 'showCode') === tc.booking.code, 'รหัสตั๋วไม่ตรง');
    assert(text(win, 'showPhone') === tc.booking.phone, 'เบอร์โทรไม่ตรง');
    assert(text(win, 'showPrice').indexOf(String(tc.expectedPrice)) !== -1, 'ยอดชำระไม่ตรง');

    var leg2Visible = !win.document.getElementById('leg2RouteRow').classList.contains('hidden');
    assert(leg2Visible === tc.expectLeg2, tc.expectLeg2 ? 'ควรแสดง Leg 2' : 'ไม่ควรแสดง Leg 2');
    if (tc.expectLeg2) {
      assert(text(win, 'showLeg2Route') !== '-', 'Leg 2 route ว่าง');
      assert(text(win, 'showLeg2Time') !== '-', 'Leg 2 time ว่าง');
    }
    if (tc.expectCheckinDisabled) {
      assert(win.document.getElementById('btnCheckin').disabled, 'ตั๋วเช็คอินแล้วควรปิดปุ่มเช็คอิน');
    }
    if (tc.expectCancelDisabled) {
      assert(win.document.getElementById('btnCancel').disabled, 'ตั๋วยกเลิกแล้วควรปิดปุ่มยกเลิก');
    }
  }

  async function runPassengerCase(win, tc) {
    await waitFor(function() { return win.document.getElementById('selOrigin') && win.document.getElementById('schedWrapper'); }, 8000, 'passenger page ไม่พร้อม');
    setSelect(win, 'selOrigin', tc.origin);
    await sleep(100);
    setSelect(win, 'selDest', tc.destination);
    await sleep(250);
    if (typeof win.renderSched === 'function') win.renderSched();
    await sleep(200);

    var wrapper = win.document.getElementById('schedWrapper');
    var content = wrapper.textContent || '';
    assert(content.trim().length > 0, 'ตารางผู้โดยสารไม่แสดง');
    (tc.expectedTimes || []).forEach(function(t) {
      assert(content.indexOf(t) !== -1, 'ไม่พบเวลา ' + t + ' ในตารางผู้โดยสาร');
    });
    var leg2Visible = !!wrapper.querySelector('.leg2-card');
    assert(leg2Visible === tc.expectLeg2, tc.expectLeg2 ? 'ควรแสดงตารางต่อรถ' : 'ไม่ควรเป็นตารางต่อรถ');
    assert(content.indexOf(tc.destination.replace('ฉะเชิงเทรา (แปดริ้ว)', '')) !== -1 || content.indexOf(tc.destination) !== -1, 'ไม่พบปลายทางในตาราง');
  }

  function setSelect(win, id, value) {
    var el = win.document.getElementById(id);
    assert(el, 'ไม่พบ select #' + id);
    var exists = Array.prototype.some.call(el.options, function(opt) { return opt.value === value || opt.textContent.trim() === value; });
    assert(exists, 'ไม่มี option ' + value + ' ใน #' + id);
    el.value = value;
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  function setInput(win, id, value) {
    var el = win.document.getElementById(id);
    assert(el, 'ไม่พบ input #' + id);
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
  }

  function callIf(win, name) {
    if (typeof win[name] === 'function') {
      var args = Array.prototype.slice.call(arguments, 2);
      return win[name].apply(win, args);
    }
  }

  function click(el) {
    assert(el, 'ไม่มี element สำหรับ click');
    if (typeof el.click === 'function') {
      el.click();
      return;
    }
    var view = el.ownerDocument.defaultView;
    el.dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true, view: view }));
  }

  function text(win, id) {
    var el = win.document.getElementById(id);
    return el ? el.textContent.trim() : '';
  }

  function isVisible(el) {
    if (!el) return false;
    var style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function waitFor(fn, timeout, message) {
    var start = Date.now();
    return new Promise(function(resolve, reject) {
      function tick() {
        try {
          if (fn()) return resolve();
        } catch (e) {}
        if (Date.now() - start > timeout) return reject(new Error(message || 'timeout'));
        setTimeout(tick, 80);
      }
      tick();
    });
  }

  function sleep(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'assert failed');
  }

  function setCase(id, status, detail) {
    var row = byId('case-' + id);
    if (!row) return;
    var badge = row.querySelector('[data-status]');
    var detailEl = row.querySelector('[data-detail]');
    var label = { wait: 'WAIT', run: 'RUN', pass: 'PASS', fail: 'FAIL', skip: 'SKIP' }[status] || status.toUpperCase();
    badge.className = 'badge ' + (status === 'wait' ? '' : status);
    badge.textContent = label;
    detailEl.textContent = detail || '';
    if (status !== 'wait') state.results[id] = status;
    updateStats();
  }

  function updateStats() {
    var total = groups.reduce(function(sum, g) { return sum + g.cases.length; }, 0);
    var vals = Object.keys(state.results).map(function(k) { return state.results[k]; });
    byId('statTotal').textContent = total;
    byId('statPass').textContent = vals.filter(function(v) { return v === 'pass'; }).length;
    byId('statFail').textContent = vals.filter(function(v) { return v === 'fail'; }).length;
    byId('statRun').textContent = vals.filter(function(v) { return v === 'run'; }).length;
  }

  function setButtons(enabled) {
    ['runAllBtn', 'runBookingBtn', 'runTicketBtn', 'runPassengerBtn', 'clearBtn'].forEach(function(id) {
      byId(id).disabled = !enabled;
    });
  }

  function log(msg) {
    var el = byId('log');
    var time = new Date().toLocaleTimeString('th-TH');
    el.textContent += '[' + time + '] ' + msg + '\n';
    el.scrollTop = el.scrollHeight;
  }

  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, function(ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
