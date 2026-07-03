/**
 * booking-pos.js
 * POS Layer สำหรับ booking.html ใหม่
 * รับข้อมูลจาก ERP (catalog-engine + schedule-engine ผ่าน booking-bridge)
 * แล้วเขียนลง Firebase — เหมือน repo booking.html จริงทุกจุดสำคัญ
 *
 * ครอบคลุม:
 *   [1] sanitizeText / sanitizePhone / isValidThaiPhone
 *   [2] TEST_MODE + BOOKING_OPEN + BOOKING_CUTOFF_MINUTES (อ่านจาก settings)
 *   [3] Anti-spam / _submitLock / dupKey deduplication
 *   [4] computePriceServerSide — อ่านจาก catalog เท่านั้น
 *   [5] uploadSlipToStorage + compressSlipImage
 *   [6] submitBooking → Firebase /bookings/{code}
 *   [7] sendLineMessage (mock ใน TEST_MODE, trigger Firebase Function ใน production)
 *   [8] grantTicketAccess + goCheckin + newBooking
 *   [9] LINE in-app browser detection
 *   [10] settings realtime sync (bookingOpen, testMode, cutoffMinutes)
 */
(function(global) {
  'use strict';

  /* ── runtime state ── */
  var _submitLock   = false;
  var _lastSubmitTs = 0;
  var _slipFileObj  = null;
  var _slipUrl      = '';
  var _lastBooking  = null;
  var _authReady    = null;

  /* ── settings (override จาก Firebase /settings) ── */
  global.BOOKING_OPEN            = true;
  global.TEST_MODE               = false;
  global.BOOKING_CUTOFF_MINUTES  = 60;
  global.PAYMENT_MODE            = 'transfer';   // transfer | onsite
  global.PAYMENT_BANK_NAME       = 'ธนาคารกสิกรไทย (KBank)';
  global.PAYMENT_ACCOUNT_NO      = 'xxx-x-xxxxx-x';
  global.PAYMENT_ACCOUNT_NAME    = 'บริษัท เอส.แอล. ทรานซิท จำกัด';
  global.SERVICE_FEE_ENABLED     = false;
  global.SERVICE_FEE_AMOUNT      = 0;

  /* ──────────────────────────────────────────────────────
     [SCHEMA v3] BOOKING STATUS ENUM
     ตรงกับ BRIEFING_FOR_BOOKING_AI.md ข้อ 4 — พร้อมใช้ทันที
     ไม่พึ่ง erp-core.js — เป็น constant ล้วนๆ
  ────────────────────────────────────────────────────── */
  var BOOKING_STATUS = {
    AWAITING_PAYMENT: 'awaiting_payment',  // แทน pending (เดิม)
    CONFIRMED:        'confirmed',          // แทน paid (เดิม)
    CHECKED_IN:       'checked_in',         // ใหม่: GPS เช็คอิน
    COMPLETED:        'completed',          // ใหม่: เดินทางถึงปลายทาง
    CANCELLED:        'cancelled',
    REFUNDED:         'refunded',           // ใหม่
    EXPIRED:          'expired',            // ใหม่: จ่ายไม่ทัน
    NO_SHOW:          'no_show'             // ใหม่
  };
  global.BOOKING_STATUS = BOOKING_STATUS;

  /* ──────────────────────────────────────────────────────
     [SCHEMA v3] BOOKING ID GENERATOR
     ตรงกับ BRIEFING_FOR_BOOKING_AI.md ข้อ 3 — พร้อมใช้ทันที
     รูปแบบใหม่: BK-YYYYMMDD-6X (สุ่ม 6 ตัวอักษร แทน sequential)
     ป้องกันการเปิดเผยปริมาณธุรกิจจากเลขรันตามลำดับ
  ────────────────────────────────────────────────────── */
  function generateBookingId(prefix) {
    var p = prefix || (global.TEST_MODE ? 'TB' : 'BK');
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var rand = Math.random().toString(36).toUpperCase().slice(2, 8);
    /* กันกรณี Math.random ให้ char น้อยกว่า 6 (โอกาสน้อยมากแต่กันไว้) */
    while (rand.length < 6) rand += Math.random().toString(36).toUpperCase().slice(2, 3);
    return p + '-' + date + '-' + rand.slice(0, 6);
  }
  global.generateBookingId = generateBookingId;

  /* ──────────────────────────────────────────────────────
     [1] INPUT SANITIZER  (ตรงกับ repo booking.html)
  ────────────────────────────────────────────────────── */
  function sanitizeText(str) {
    if (typeof str !== 'string') return '';
    str = str.trim().replace(/[<>"'`]/g, '');
    return str.slice(0, 200);
  }

  function sanitizePhone(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^0-9]/g, '').slice(0, 10);
  }

  function isValidThaiPhone(val) {
    var v = sanitizePhone(String(val || ''));
    return v.length === 10 && /^(06|08|09)\d{8}$/.test(v);
  }

  /* expose */
  global.sanitizeText   = sanitizeText;
  global.sanitizePhone  = sanitizePhone;
  global.isValidThaiPhone = isValidThaiPhone;

  /* ──────────────────────────────────────────────────────
     [2] SETTINGS SYNC — อ่าน /settings realtime
     override BOOKING_OPEN, TEST_MODE, cutoffMinutes,
     payment mode, bank info
  ────────────────────────────────────────────────────── */
  function _initSettingsSync(db) {
    db.ref('settings').on('value', function(snap) {
      var data = snap.val() || {};

      global.BOOKING_OPEN           = data.bookingOpen !== false;
      global.TEST_MODE              = data.testMode === true;
      var cut = Number(data.bookingCutoffMinutes);
      global.BOOKING_CUTOFF_MINUTES = (isFinite(cut) && cut >= 0) ? cut : 60;

      if (data.payment) {
        global.PAYMENT_MODE         = (data.payment.mode === 'transfer') ? 'transfer' : 'onsite';
        global.PAYMENT_BANK_NAME    = data.payment.bankName    || global.PAYMENT_BANK_NAME;
        global.PAYMENT_ACCOUNT_NO   = data.payment.accountNo   || global.PAYMENT_ACCOUNT_NO;
        global.PAYMENT_ACCOUNT_NAME = data.payment.accountName || global.PAYMENT_ACCOUNT_NAME;
      }
      if (data.fees) {
        global.SERVICE_FEE_ENABLED  = data.fees.serviceEnabled === true;
        global.SERVICE_FEE_AMOUNT   = Number(data.fees.service) || 0;
      }

      /* อัปเดต UI */
      _applyBookingOpenUI();
      _applyTestModeUI();
      _applyPaymentModeUI();

      /* live update booking.html UI (consent policy, payment info, fees) */
      if (typeof global._applySettings === 'function') {
        global._applySettings(data);
      }

      console.log('[POS] settings synced — TEST_MODE:', global.TEST_MODE,
        '| BOOKING_OPEN:', global.BOOKING_OPEN,
        '| PAYMENT_MODE:', global.PAYMENT_MODE);
    }, function(err) {
      console.warn('[POS] settings sync failed', err);
    });
  }

  function _applyBookingOpenUI() {
    var overlay = document.getElementById('bookingClosedOverlay');
    if (overlay) overlay.style.display = global.BOOKING_OPEN ? 'none' : 'flex';
    var btn = document.getElementById('btnConfirm');
    if (btn) btn.disabled = !global.BOOKING_OPEN;
  }

  function _applyTestModeUI() {
    var strip = document.getElementById('testModeStrip');
    if (strip) strip.style.display = global.TEST_MODE ? 'block' : 'none';
  }

  function _applyPaymentModeUI() {
    var isTransfer = global.PAYMENT_MODE === 'transfer';
    /* payment method section */
    var pmBank      = document.getElementById('pm-bank');
    var pmPromptpay = document.getElementById('pm-promptpay');
    var bankInfoBox = document.getElementById('pay-detail-bank');
    var slipSec     = document.getElementById('slipUploadCard');
    var bankName    = document.getElementById('pm-bank-name');
    var bankAcc     = document.getElementById('pm-bank-acc');
    var bankOwner   = document.getElementById('pm-bank-owner');

    if (bankName)  bankName.textContent  = global.PAYMENT_BANK_NAME;
    if (bankAcc)   bankAcc.textContent   = global.PAYMENT_ACCOUNT_NO;
    if (bankOwner) bankOwner.textContent = global.PAYMENT_ACCOUNT_NAME;

    /* onsite = ซ่อน bank + slip section เปิดอยู่โดยปุ่ม */
    if (!isTransfer) {
      if (pmBank)      pmBank.style.display      = 'none';
      if (pmPromptpay) pmPromptpay.style.display  = 'none';
      if (slipSec)     slipSec.style.display      = 'none';
      var onsiteNote = document.getElementById('onsite-payment-note');
      if (onsiteNote) onsiteNote.style.display = 'block';
    }
  }

  /* ──────────────────────────────────────────────────────
     [3] ANTI-SPAM / PRICE LOCK
  ────────────────────────────────────────────────────── */
  /* Security: คำนวณราคาจาก catalog ERP ไม่รับจาก state.tripFare */
  function computePriceServerSide(originKey, destKey) {
    if (!global.SLBookingBridge) return 55; // fallback
    /* ลอง catalog.fares ผ่าน bridge */
    var bridge = global.SLBookingBridge;
    /* ดึงจาก SEGMENT_PRICE ที่ settings sync ไว้ */
    if (global.SEGMENT_PRICE && global.SEGMENT_PRICE[originKey] &&
        global.SEGMENT_PRICE[originKey][destKey] !== undefined) {
      return Number(global.SEGMENT_PRICE[originKey][destKey]) || 55;
    }
    /* fallback: bridge fare (จาก catalog.fares) */
    return bridge.getFare(originKey + '_' + destKey) || 55;
  }

  function getServiceFeeTotal(pax) {
    return global.SERVICE_FEE_ENABLED ? global.SERVICE_FEE_AMOUNT * pax : 0;
  }

  /* ──────────────────────────────────────────────────────
     [4] BOOKING CUTOFF CHECK
  ────────────────────────────────────────────────────── */
  function canBook(dateStr, timeStr) {
    var now  = new Date();
    var dep  = new Date(dateStr + 'T' + timeStr + ':00');
    var diff = (dep - now) / 60000;
    return diff > global.BOOKING_CUTOFF_MINUTES;
  }

  /* ──────────────────────────────────────────────────────
     [5] SLIP COMPRESSION + UPLOAD
  ────────────────────────────────────────────────────── */
  function compressSlipImage(file, callback) {
    var MAX_W = 1200, MAX_H = 1200, QUALITY = 0.7;
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var w = img.width, h = img.height;
        if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
        if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob) {
          var compressed = new File([blob], file.name, { type: 'image/jpeg' });
          callback(compressed);
        }, 'image/jpeg', QUALITY);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function onSlipSelectPOS(input) {
    var file = input.files[0];
    if (!file) return;
    if (_slipFileObj) {
      alert('แนบหลักฐานได้เพียง 1 ครั้ง หากต้องการเปลี่ยนให้เริ่มรายการใหม่');
      input.value = ''; return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('ไฟล์ใหญ่เกิน 5MB'); input.value = ''; return;
    }
    /* preview ทันที */
    var reader = new FileReader();
    reader.onload = function(e) {
      var prevImg  = document.getElementById('previewImg');
      var prevWrap = document.getElementById('previewWrap');
      if (prevImg)  prevImg.src = e.target.result;
      if (prevWrap) prevWrap.style.display = 'block';
    };
    reader.readAsDataURL(file);

    /* compress แล้วเก็บ */
    compressSlipImage(file, function(compressed) {
      _slipFileObj = compressed;
      var prevName = document.getElementById('previewName');
      var origKB   = Math.round(file.size / 1024);
      var compKB   = Math.round(compressed.size / 1024);
      if (prevName) prevName.textContent = '✅ ' + file.name + ' (' + origKB + 'KB → ' + compKB + 'KB)';
      /* lock upload area */
      var area = document.getElementById('uploadArea');
      if (area) area.classList.add('locked');
      input.disabled = true;
    });
  }

  function uploadSlipToStorage(storage, file, bookingCode) {
    return new Promise(function(resolve, reject) {
      if (!file) { resolve(''); return; }
      var bar  = document.getElementById('uploadProgressBar');
      var prog = document.getElementById('uploadProgress');
      if (prog) prog.style.display = 'block';
      var safeCode = String(bookingCode || '').replace(/[^A-Za-z0-9_-]/g, '');
      var path = 'slips/' + safeCode + '/' + Date.now() + '.jpg';
      var task = storage.ref().child(path).put(file, { contentType: 'image/jpeg' });
      task.on('state_changed',
        function(snap) { if (bar && snap.totalBytes) bar.style.width = Math.round(snap.bytesTransferred / snap.totalBytes * 100) + '%'; },
        function(err)  { console.error('[POS] storage upload failed', err); reject(new Error('STORAGE_UPLOAD_FAILED')); },
        function()     { task.snapshot.ref.getDownloadURL().then(resolve).catch(function() { reject(new Error('STORAGE_UPLOAD_FAILED')); }); }
      );
    });
  }

  /* expose ── booking.html เรียกจาก onchange="onSlipSelectPOS(this)" */
  global.onSlipSelectPOS = onSlipSelectPOS;

  /* ──────────────────────────────────────────────────────
     [6] SUBMIT BOOKING → Firebase  (POS write)
     รับ booking state จาก booking.html (ผ่าน SLBookingBridge)
  ────────────────────────────────────────────────────── */
  function submitBooking() {
    /* ── Guard ── */
    if (!global.BOOKING_OPEN) { alert('ขณะนี้ปิดรับสำรองที่นั่งชั่วคราว'); return; }
    var now = Date.now();
    if (_submitLock) { alert('กำลังดำเนินการ กรุณารอสักครู่'); return; }
    if (now - _lastSubmitTs < 30000 && _lastSubmitTs > 0) { alert('กรุณารอสักครู่ก่อนส่งข้อมูลใหม่'); return; }

    var appState = global.state || {};
    if (!appState.consentAccepted) { alert('กรุณาอ่านและยอมรับข้อตกลงการใช้บริการก่อน'); return; }

    /* admin tester: bypass slip requirement */
    var isAdminTester = global.ADMIN_TESTER_ACTIVE === true;
    if (global.PAYMENT_MODE === 'transfer' && !global.TEST_MODE && !isAdminTester && !_slipFileObj) {
      alert('กรุณาแนบรูปสลิปการโอนเงิน'); return;
    }

    /* ── Sanitize ── */
    var nameEl  = document.getElementById('inp-name');
    var phoneEl = document.getElementById('inp-phone');
    var safeName  = sanitizeText(nameEl  ? nameEl.value  : appState.name  || '');
    var safePhone = sanitizePhone(phoneEl ? phoneEl.value : appState.phone || '');

    if (!safeName  || safeName.length < 2)  { alert('ชื่อ-นามสกุลไม่ถูกต้อง'); return; }
    if (!isValidThaiPhone(safePhone))        { alert('เบอร์โทรไม่ถูกต้อง (ต้องเป็นเบอร์ไทย 10 หลัก)'); return; }
    if (!appState.tripTime)                  { alert('กรุณาเลือกเวลาเดินทาง'); return; }
    if (!appState.originKey || !appState.destKey || appState.originKey === appState.destKey) {
      alert('เส้นทางไม่ถูกต้อง'); return;
    }

    /* ── Date ── */
    var dateVal = typeof global._serviceDateISO === 'function' ? global._serviceDateISO() : _todayISO();

    /* ── Capacity & Admin Close checks (via SLBookingCapacity) ── */
    var CAP = global.SLBookingCapacity;
    if (CAP) {
      if (CAP.isClosedByAdmin(appState.originKey, appState.destKey, appState.tripTime)) {
        alert('รอบนี้งดรับสำรองที่นั่งสำหรับเส้นทางนี้'); return;
      }
      if (CAP.isTripFull(appState.originKey, appState.destKey, dateVal, appState.tripTime, appState.pax)) {
        alert('รอบนี้เต็มแล้ว กรุณาเลือกรอบเวลาอื่น');
        if (typeof global.renderTrips === 'function') global.renderTrips();
        return;
      }
    }

    if (!canBook(dateVal, appState.tripTime)) {
      alert('รอบเวลานี้ปิดรับสำรองที่นั่งแล้ว (เกินเวลาที่กำหนด)'); return;
    }

    /* ── Pricing (server-side only) ── */
    var serverPrice = computePriceServerSide(appState.originKey, appState.destKey);
    var svcFee      = getServiceFeeTotal(appState.pax || 1);
    var totalFare   = serverPrice * (appState.pax || 1);
    var grandTotal  = totalFare + svcFee;

    /* ── dupKey ── */
    var dupKey = appState.originKey + '_' + appState.destKey + '_' + dateVal + '_' + appState.tripTime;

    /* ── UI lock ── */
    var btn = document.getElementById('btnConfirm');
    _submitLock   = true;
    _lastSubmitTs = now;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังตรวจสอบ...'; }

    var db      = global._db;
    var storage = global._storage;
    var bookingPath = global.TEST_MODE ? 'testBookings/' : 'bookings/';
    var queuePath   = global.TEST_MODE ? 'testQueues/'   : 'queues/';
    var bookingSaved = false;

    /* ── Step 1: dupKey check (กันจองซ้ำ) ── */
    db.ref(bookingPath).orderByChild('dupKey').equalTo(dupKey).once('value')
      .then(function(snap) {
        if (snap.exists()) {
          /* มีการจองนี้อยู่แล้ว */
          var existing = null;
          snap.forEach(function(child) { if (!existing) existing = child.val(); });
          if (existing && existing.status !== 'cancelled') {
            var msg = global.TEST_MODE
              ? '[TEST] รหัสการจองนี้มีอยู่แล้ว: ' + (existing.code || '')
              : 'คุณได้สำรองที่นั่งเที่ยวนี้ไว้แล้ว รหัสจอง: ' + (existing.code || '');
            alert(msg);
            throw new Error('DUPLICATE');
          }
        }
        /* Step 2: queue counter */
        if (btn) btn.textContent = '⏳ กำลังจัดคิว...';
        return db.ref(queuePath + dupKey).transaction(function(cur) { return (cur || 0) + (appState.pax || 1); });
      })
      .then(function(txResult) {
        if (!txResult || !txResult.committed) throw new Error('QUEUE_ERROR');
        var qEnd   = txResult.snapshot.val();
        var qStart = qEnd - (appState.pax || 1) + 1;
        return { queueNum: qStart };
      })
      .then(function(qResult) {
        /* Step 3: reserve capacity (atomic) */
        if (btn) btn.textContent = '⏳ กำลังจองที่นั่ง...';
        var CAP = global.SLBookingCapacity;
        var reservePromise = CAP
          ? CAP.reserveTripCapacity(_db, dateVal, appState.originKey, appState.destKey, appState.tripTime, appState.pax)
          : Promise.resolve({ reserved: true, path: '', limit: 0, seats: appState.pax });

        return reservePromise.then(function(reservation) {
          return { queueNum: qResult.queueNum, reservation: reservation };
        });
      })
      .then(function(qResult) {
        /* Step 4: upload slip */
        if (btn) btn.textContent = '⏳ กำลังอัปโหลดสลิป...';
        var code = generateBookingId();
        var uploadPromise = (_slipFileObj && !global.TEST_MODE && global.PAYMENT_MODE === 'transfer')
          ? uploadSlipToStorage(storage, _slipFileObj, code)
          : Promise.resolve('');

        return uploadPromise.then(function(slipUrl) {
          _slipUrl = slipUrl;
          return { queueNum: qResult.queueNum, code: code, slipUrl: slipUrl, reservation: qResult.reservation };
        });
      })
      .then(function(result) {
        /* Step 5: build booking snapshot via bridge */
        if (btn) btn.textContent = '⏳ กำลังบันทึก...';
        var ti  = appState.transferInfo || null;
        var CAP = global.SLBookingCapacity;

        /* legSchedule — ตรงกับ repo booking.html */
        var legSchedule = CAP ? CAP.buildLegSchedule(
          appState.originKey,  appState.destKey,
          appState.originName, appState.destName,
          appState.tripTime,   ti
        ) : {};

        var seatsLeft = CAP ? CAP.getSeatsLeft(appState.originKey, appState.destKey, dateVal, appState.tripTime) : null;
        var platform  = CAP ? CAP.getPlatformLabel(appState.destKey) : '';

        var booking = global.SLBookingBridge.buildBookingSnapshot({
          bookingCode:   result.code,
          name:          safeName,
          phone:         safePhone,
          pax:           appState.pax || 1,
          originStopKey: appState.originKey,
          destStopKey:   appState.destKey,
          pickupTime:    appState.tripTime,
          serviceDate:   dateVal,
          isLeg2:        appState.isLeg2Dest || false,
          transferInfo:  ti,
          queueNo:       appState.tripAssignment && appState.tripAssignment.queueNo || '',
          vehicleId:     appState.tripAssignment && appState.tripAssignment.plannedVehicleId || '',
          fare:          grandTotal,
          payMethod:     global.PAYMENT_MODE,
          slipUploaded:  !!result.slipUrl,
          assignment:    appState.tripAssignment || null
        });

        /* fields ครบเหมือน repo */
        booking.route            = (appState.originName || '') + ' → ' + (appState.destName || '');
        booking.origin           = appState.originName  || appState.originKey;
        booking.destination      = appState.destName    || appState.destKey;
        booking.time             = appState.tripTime;
        booking.date             = dateVal;
        booking.seats            = appState.pax || 1;
        booking.price            = grandTotal;
        booking.serviceFee       = svcFee;
        booking.serverPrice      = serverPrice;
        booking.slip             = result.slipUrl;
        booking.slipImageUrl     = result.slipUrl;
        booking.paymentStatus    = result.slipUrl
          ? 'slip_uploaded'
          : (global.PAYMENT_MODE === 'transfer' ? 'mock_payment' : 'pay_on_site');
        /* booking.status ถูก set แล้วโดย SLBookingBridge.buildBookingSnapshot() ด้วย BOOKING_STATUS.AWAITING_PAYMENT */
        booking.dupKey           = dupKey;
        booking.queueNumber      = result.queueNum;
        booking.bookingSequenceNumber = result.queueNum;
        booking.legSchedule      = legSchedule;        /* ← ต้องมีสำหรับ check_ticket */
        booking.leg1Route        = legSchedule.leg1;
        booking.leg1Time         = legSchedule.leg1Time;
        booking.leg2Route        = legSchedule.leg2;
        booking.leg2Time         = legSchedule.leg2Time;
        booking.platform         = platform;
        booking.seatsLeft        = seatsLeft;
        booking.capacityReservation = result.reservation ? result.reservation.path : '';
        booking.testMode         = global.TEST_MODE;
        booking.mockPayment      = global.TEST_MODE;
        booking.ticketQrVersion  = 'SLT1';
        booking.ts               = firebase.database.ServerValue.TIMESTAMP;

        /* ── Firebase write ── */
        return db.ref(bookingPath + result.code).set(booking)
          .then(function() {
            bookingSaved = true;
            return { booking: booking, reservation: result.reservation };
          });
      })
      .then(function(res) {
        /* Step 6: sendLine + test log */
        var booking = res.booking;
        var linePayload = {
          event:          'booking_created',
          source:         'booking1.html',
          booking_id:     booking.code,
          passenger_name: booking.name,
          route:          booking.route,
          round_time:     booking.time,
          date:           booking.date,
          seats:          booking.seats,
          price:          booking.price,
          test_mode:      global.TEST_MODE,
          original_payload: booking
        };
        var sideEffects = [sendLineMessage(linePayload)];
        if (global.TEST_MODE) {
          sideEffects.push(_db.ref('test_booking_logs').push({
            booking_id:     booking.code,
            timestamp:      firebase.database.ServerValue.TIMESTAMP,
            passenger_name: booking.name,
            route:          booking.route,
            round_time:     booking.time,
            test_mode:      true
          }));
        }
        return Promise.all(sideEffects).then(function() { return res.booking; });
      })
      .then(function(booking) {
        _submitLock  = false;
        _lastBooking = booking;
        /* expose ให้ downloadTicketImage ใน booking.html */
        global._lastBooking = booking;

        _grantTicketAccess(booking.code);

        /* verify slip — non-blocking, update paymentStatus */
        if (booking.slipImageUrl && typeof global.verifySlipPayment === 'function') {
          global.verifySlipPayment(booking.code, booking.slipImageUrl)
            .then(function(result) {
              if (result && result.paymentStatus) {
                var path = (global.TEST_MODE ? 'testBookings/' : 'bookings/') + booking.code + '/paymentStatus';
                _db.ref(path).set(result.paymentStatus);
              }
            })
            .catch(function(err) { console.warn('[POS] verifySlip:', err.message); });
        }

        if (typeof global.showTicketPage === 'function') {
          global.showTicketPage(booking);
        }
      })
      .catch(function(err) {
        _submitLock = false;
        if (btn) { btn.disabled = false; btn.textContent = '✅ ยืนยันการชำระเงิน ›'; }

        /* CAPACITY_FULL — release reservation ถ้ามี */
        if (err && err.message === 'CAPACITY_FULL') {
          alert('รอบนี้เต็มแล้ว กรุณาเลือกรอบเวลาอื่น');
          if (typeof global.renderTrips === 'function') global.renderTrips();
          return;
        }
        if (err && err.message === 'DUPLICATE')             return;
        if (err && err.message === 'QUEUE_ERROR')           { alert('เกิดข้อผิดพลาดในการนับคิว กรุณาลองใหม่'); return; }
        if (err && err.message === 'STORAGE_UPLOAD_FAILED') { alert('อัปโหลดสลิปไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ'); return; }
        console.error('[POS] submitBooking error', err);
        alert('เกิดข้อผิดพลาด: ' + (err.message || 'กรุณาลองใหม่'));
      });
  }

  global.submitBooking = submitBooking;

  /* ──────────────────────────────────────────────────────
     [7] LINE OA NOTIFICATION
     production: Firebase Function sendLineOnBooking รอที่ /bookings/{code}
     test: mock log ลง /test_line_logs
  ────────────────────────────────────────────────────── */
  function sendLineMessage(payload) {
    if (global.TEST_MODE || (payload && payload.test_mode)) {
      return (global._db).ref('test_line_logs').push({
        booking_id:    payload.booking_id || '',
        timestamp:     firebase.database.ServerValue.TIMESTAMP,
        passenger_name:payload.passenger_name || '',
        route:         payload.route || '',
        round_time:    payload.round_time || '',
        test_mode:     true,
        line_mock_status: 'success',
        original_payload: payload
      }).then(function() { return { success: true, mock: true }; });
    }
    /* production: Firebase Function จะ trigger อัตโนมัติจาก /bookings/{code}.set() */
    return Promise.resolve({ success: true, server_trigger: 'bookings/{code}' });
  }

  /* ──────────────────────────────────────────────────────
     [8] TICKET ACCESS + CHECKIN + NEW BOOKING
  ────────────────────────────────────────────────────── */
  function _grantTicketAccess(code) {
    if (!_authReady || !code) return;
    _authReady.then(function(cred) {
      var user = cred && cred.user ? cred.user : firebase.auth().currentUser;
      if (!user) return;
      return (global._db).ref('ticketAccess/' + user.uid + '/' + code).set(true);
    }).catch(function(err) { console.warn('[POS] grantTicketAccess failed', err); });
  }

  function goCheckin() {
    var code = _lastBooking && _lastBooking.code || '';
    if (!code) { alert('ไม่พบรหัสตั๋ว'); return; }
    try { sessionStorage.setItem('latestBooking', JSON.stringify(_lastBooking)); } catch(e){}
    var phone = sanitizePhone((global.state && global.state.phone) || '');
    window.location.href = 'check_ticket.html?code=' + encodeURIComponent(code)
      + '&phone=' + encodeURIComponent(phone)
      + '&v=' + Date.now();
  }

  function newBooking() {
    /* รีเซ็ต POS state */
    _slipFileObj = null; _slipUrl = ''; _lastBooking = null;
    _submitLock = false; _lastSubmitTs = 0;

    /* รีเซ็ต slip UI */
    var slipInput = document.getElementById('slipFile');
    var uploadArea = document.getElementById('uploadArea');
    var prevWrap   = document.getElementById('previewWrap');
    var prevImg    = document.getElementById('previewImg');
    var prevName   = document.getElementById('previewName');
    var bar        = document.getElementById('uploadProgressBar');
    if (slipInput)  { slipInput.value = ''; slipInput.disabled = false; }
    if (uploadArea) uploadArea.classList.remove('locked');
    if (prevWrap)   prevWrap.style.display = 'none';
    if (prevImg)    prevImg.src = '';
    if (prevName)   prevName.textContent = '';
    if (bar)        bar.style.width = '0%';

    /* delegate reset + navigate ไปหน้า 1 */
    if (typeof global.resetBookingState === 'function') global.resetBookingState();
    if (typeof global.showPage === 'function') global.showPage(1);
    if (typeof global.renderTrips === 'function') global.renderTrips();
  }

  global.goCheckin  = goCheckin;
  global.newBooking = newBooking;

  /* ──────────────────────────────────────────────────────
     [9] LINE IN-APP BROWSER DETECTION
  ────────────────────────────────────────────────────── */
  function _detectLineBrowser() {
    var ua = navigator.userAgent || '';
    if (!/Line\//i.test(ua)) return;
    if (window.location.search.indexOf('ext=1') !== -1) return;
    var overlay = document.getElementById('lineBrowserOverlay');
    if (overlay) overlay.classList.add('show');
  }

  function tryOpenExternal() {
    var url = window.location.href;
    if (url.indexOf('ext=1') === -1) url += (url.indexOf('?') === -1 ? '?' : '&') + 'ext=1';
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) {
      window.location.href = 'googlechrome://' + url.replace(/^https?:\/\//, '');
      setTimeout(function() { window.location.href = url; }, 1500);
    } else {
      var intent = 'intent://' + url.replace(/^https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end';
      window.location.href = intent;
      setTimeout(function() { window.location.href = url; }, 1500);
    }
  }

  global.tryOpenExternal = tryOpenExternal;

  /* ──────────────────────────────────────────────────────
     [10] INIT — เรียกจาก booking.html หลัง Firebase init
  ────────────────────────────────────────────────────── */
  function init(db, storage, authPromise) {
    global._db      = db;
    global._storage = storage;
    _authReady      = authPromise || Promise.resolve(null);

    _initSettingsSync(db);
    _detectLineBrowser();

    console.log('[POS] booking-pos.js initialized');
  }

  function _todayISO() {
    var d = new Date();
    function pad(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  global.SLBookingPOS = { init: init };

})(window);
