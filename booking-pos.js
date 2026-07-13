/**
 * booking-pos.js
 * POS Layer เธชเธณเธซเธฃเธฑเธ booking.html เนเธซเธกเน
 * เธฃเธฑเธเธเนเธญเธกเธนเธฅเธเธฒเธ ERP (catalog-engine + schedule-engine เธเนเธฒเธ booking-bridge)
 * เนเธฅเนเธงเน€เธเธตเธขเธเธฅเธ Firebase โ€” เน€เธซเธกเธทเธญเธ repo booking.html เธเธฃเธดเธเธ—เธธเธเธเธธเธ”เธชเธณเธเธฑเธ
 *
 * เธเธฃเธญเธเธเธฅเธธเธก:
 *   [1] sanitizeText / sanitizePhone / isValidThaiPhone
 *   [2] TEST_MODE + BOOKING_OPEN + BOOKING_CUTOFF_MINUTES (เธญเนเธฒเธเธเธฒเธ settings)
 *   [3] Anti-spam / _submitLock / dupKey deduplication
 *   [4] computePriceServerSide โ€” เธญเนเธฒเธเธเธฒเธ catalog เน€เธ—เนเธฒเธเธฑเนเธ
 *   [5] uploadSlipToStorage + compressSlipImage
 *   [6] submitBooking โ’ Firebase /bookings/{code}
 *   [7] sendLineMessage (mock เนเธ TEST_MODE, trigger Firebase Function เนเธ production)
 *   [8] grantTicketAccess + goCheckin + newBooking
 *   [9] LINE in-app browser detection
 *   [10] settings realtime sync (bookingOpen, testMode, cutoffMinutes)
 */
(function(global) {
  'use strict';

  /* โ”€โ”€ runtime state โ”€โ”€ */
  var _submitLock   = false;
  var _lastSubmitTs = 0;
  var _slipFileObj  = null;
  var _slipUrl      = '';
  var _lastBooking  = null;
  var _authReady    = null;

  /* โ”€โ”€ settings (override เธเธฒเธ Firebase /settings) โ”€โ”€ */
  global.BOOKING_OPEN            = true;
  global.TEST_MODE               = false;
  global.BOOKING_CUTOFF_MINUTES  = 60;
  global.PAYMENT_MODE            = 'transfer';   // transfer | onsite
  global.PAYMENT_BANK_NAME       = 'เธเธเธฒเธเธฒเธฃเธเธชเธดเธเธฃเนเธ—เธข (KBank)';
  global.PAYMENT_ACCOUNT_NO      = 'xxx-x-xxxxx-x';
  global.PAYMENT_ACCOUNT_NAME    = 'เธเธฃเธดเธฉเธฑเธ— เน€เธญเธช.เนเธญเธฅ. เธ—เธฃเธฒเธเธเธดเธ— เธเธณเธเธฑเธ”';
  global.SERVICE_FEE_ENABLED     = false;
  global.SERVICE_FEE_AMOUNT      = 0;

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [SCHEMA v3] BOOKING STATUS ENUM
     เธ•เธฃเธเธเธฑเธ BRIEFING_FOR_BOOKING_AI.md เธเนเธญ 4 โ€” เธเธฃเนเธญเธกเนเธเนเธ—เธฑเธเธ—เธต
     เนเธกเนเธเธถเนเธ erp-core.js โ€” เน€เธเนเธ constant เธฅเนเธงเธเน
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
  var BOOKING_STATUS = {
    AWAITING_PAYMENT: 'awaiting_payment',  // เนเธ—เธ pending (เน€เธ”เธดเธก)
    CONFIRMED:        'confirmed',          // เนเธ—เธ paid (เน€เธ”เธดเธก)
    CHECKED_IN:       'checked_in',         // เนเธซเธกเน: GPS เน€เธเนเธเธญเธดเธ
    COMPLETED:        'completed',          // เนเธซเธกเน: เน€เธ”เธดเธเธ—เธฒเธเธ–เธถเธเธเธฅเธฒเธขเธ—เธฒเธ
    CANCELLED:        'cancelled',
    REFUNDED:         'refunded',           // เนเธซเธกเน
    EXPIRED:          'expired',            // เนเธซเธกเน: เธเนเธฒเธขเนเธกเนเธ—เธฑเธ
    NO_SHOW:          'no_show'             // เนเธซเธกเน
  };
  global.BOOKING_STATUS = BOOKING_STATUS;

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [SCHEMA v3] BOOKING ID GENERATOR
     เธ•เธฃเธเธเธฑเธ BRIEFING_FOR_BOOKING_AI.md เธเนเธญ 3 โ€” เธเธฃเนเธญเธกเนเธเนเธ—เธฑเธเธ—เธต
     เธฃเธนเธเนเธเธเนเธซเธกเน: BK-YYYYMMDD-6X (เธชเธธเนเธก 6 เธ•เธฑเธงเธญเธฑเธเธฉเธฃ เนเธ—เธ sequential)
     เธเนเธญเธเธเธฑเธเธเธฒเธฃเน€เธเธดเธ”เน€เธเธขเธเธฃเธดเธกเธฒเธ“เธเธธเธฃเธเธดเธเธเธฒเธเน€เธฅเธเธฃเธฑเธเธ•เธฒเธกเธฅเธณเธ”เธฑเธ
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
  function generateBookingId(prefix) {
    var p = prefix || (global.TEST_MODE ? 'TB' : 'BK');
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var rand = Math.random().toString(36).toUpperCase().slice(2, 8);
    /* เธเธฑเธเธเธฃเธ“เธต Math.random เนเธซเน char เธเนเธญเธขเธเธงเนเธฒ 6 (เนเธญเธเธฒเธชเธเนเธญเธขเธกเธฒเธเนเธ•เนเธเธฑเธเนเธงเน) */
    while (rand.length < 6) rand += Math.random().toString(36).toUpperCase().slice(2, 3);
    return p + '-' + date + '-' + rand.slice(0, 6);
  }
  global.generateBookingId = generateBookingId;

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [1] INPUT SANITIZER  (เธ•เธฃเธเธเธฑเธ repo booking.html)
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
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

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [2] SETTINGS SYNC โ€” เธญเนเธฒเธ /settings realtime
     override BOOKING_OPEN, TEST_MODE, cutoffMinutes,
     payment mode, bank info
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
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

      /* เธญเธฑเธเน€เธ”เธ• UI */
      _applyBookingOpenUI();
      _applyTestModeUI();
      _applyPaymentModeUI();

      /* live update booking.html UI (consent policy, payment info, fees) */
      if (typeof global._applySettings === 'function') {
        global._applySettings(data);
      }

      console.log('[POS] settings synced โ€” TEST_MODE:', global.TEST_MODE,
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

    /* onsite = เธเนเธญเธ bank + slip section เน€เธเธดเธ”เธญเธขเธนเนเนเธ”เธขเธเธธเนเธก */
    if (!isTransfer) {
      if (pmBank)      pmBank.style.display      = 'none';
      if (pmPromptpay) pmPromptpay.style.display  = 'none';
      if (slipSec)     slipSec.style.display      = 'none';
      var onsiteNote = document.getElementById('onsite-payment-note');
      if (onsiteNote) onsiteNote.style.display = 'block';
    }
  }

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [3] ANTI-SPAM / PRICE LOCK
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
  /* Security: เธเธณเธเธงเธ“เธฃเธฒเธเธฒเธเธฒเธ catalog ERP เนเธกเนเธฃเธฑเธเธเธฒเธ state.tripFare */
  function computePriceServerSide(originKey, destKey) {
    var appState = global.state || {};
    var selected = appState.selectedTrip || {};
    if (selected.externalPaymentRequired || selected.fareMissing) return 0;
    return Number(selected.fareAmount) || 0;
  }

  function getServiceFeeTotal(pax) {
    return global.SERVICE_FEE_ENABLED ? global.SERVICE_FEE_AMOUNT * pax : 0;
  }

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [4] BOOKING CUTOFF CHECK
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
  function canBook(dateStr, timeStr) {
    var now  = new Date();
    var dep  = new Date(dateStr + 'T' + timeStr + ':00');
    var diff = (dep - now) / 60000;
    return diff > global.BOOKING_CUTOFF_MINUTES;
  }

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [5] SLIP COMPRESSION + UPLOAD
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
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
      alert('เนเธเธเธซเธฅเธฑเธเธเธฒเธเนเธ”เนเน€เธเธตเธขเธ 1 เธเธฃเธฑเนเธ เธซเธฒเธเธ•เนเธญเธเธเธฒเธฃเน€เธเธฅเธตเนเธขเธเนเธซเนเน€เธฃเธดเนเธกเธฃเธฒเธขเธเธฒเธฃเนเธซเธกเน');
      input.value = ''; return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('เนเธเธฅเนเนเธซเธเนเน€เธเธดเธ 5MB'); input.value = ''; return;
    }
    /* preview เธ—เธฑเธเธ—เธต */
    var reader = new FileReader();
    reader.onload = function(e) {
      var prevImg  = document.getElementById('previewImg');
      var prevWrap = document.getElementById('previewWrap');
      if (prevImg)  prevImg.src = e.target.result;
      if (prevWrap) prevWrap.style.display = 'block';
    };
    reader.readAsDataURL(file);

    /* compress เนเธฅเนเธงเน€เธเนเธ */
    compressSlipImage(file, function(compressed) {
      _slipFileObj = compressed;
      var prevName = document.getElementById('previewName');
      var origKB   = Math.round(file.size / 1024);
      var compKB   = Math.round(compressed.size / 1024);
      if (prevName) prevName.textContent = 'โ… ' + file.name + ' (' + origKB + 'KB โ’ ' + compKB + 'KB)';
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

  /* expose โ”€โ”€ booking.html เน€เธฃเธตเธขเธเธเธฒเธ onchange="onSlipSelectPOS(this)" */
  global.onSlipSelectPOS = onSlipSelectPOS;

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [6] SUBMIT BOOKING โ’ Firebase  (POS write)
     เธฃเธฑเธ booking state เธเธฒเธ booking.html (เธเนเธฒเธ SLBookingBridge)
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
  function submitBooking() {
    /* โ”€โ”€ Guard โ”€โ”€ */
    if (!global.BOOKING_OPEN) { alert('เธเธ“เธฐเธเธตเนเธเธดเธ”เธฃเธฑเธเธชเธณเธฃเธญเธเธ—เธตเนเธเธฑเนเธเธเธฑเนเธงเธเธฃเธฒเธง'); return; }
    var now = Date.now();
    if (_submitLock) { alert('เธเธณเธฅเธฑเธเธ”เธณเน€เธเธดเธเธเธฒเธฃ เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเน'); return; }
    if (now - _lastSubmitTs < 30000 && _lastSubmitTs > 0) { alert('เธเธฃเธธเธ“เธฒเธฃเธญเธชเธฑเธเธเธฃเธนเนเธเนเธญเธเธชเนเธเธเนเธญเธกเธนเธฅเนเธซเธกเน'); return; }

    var appState = global.state || {};
    if (!global.TEST_MODE && global.SLBookingBridge &&
        typeof global.SLBookingBridge.canCreateProductionBookings === 'function' &&
        !global.SLBookingBridge.canCreateProductionBookings()) {
      alert('Booking1 Preview ยังไม่ readyForApply จึงไม่เปิดสร้าง booking จริง');
      return;
    }
    if (!appState.selectedTrip || !appState.selectedTrip.bookingAllowed) {
      alert('เที่ยวนี้ยังไม่เปิดจองผ่าน Booking1');
      return;
    }
    if (appState.selectedTrip.externalPaymentRequired) {
      alert('รายการนี้เป็น external_pay และ SL-Transit ไม่เก็บค่าโดยสาร');
      return;
    }
    if (appState.selectedTrip.fareMissing) {
      alert('ยังไม่มีข้อมูล fareAmount ใน preview pair สำหรับคู่เส้นทางนี้');
      return;
    }
    if (!appState.consentAccepted) { alert('เธเธฃเธธเธ“เธฒเธญเนเธฒเธเนเธฅเธฐเธขเธญเธกเธฃเธฑเธเธเนเธญเธ•เธเธฅเธเธเธฒเธฃเนเธเนเธเธฃเธดเธเธฒเธฃเธเนเธญเธ'); return; }

    /* admin tester: bypass slip requirement */
    var isAdminTester = global.ADMIN_TESTER_ACTIVE === true;
    if (global.PAYMENT_MODE === 'transfer' && !global.TEST_MODE && !isAdminTester && !_slipFileObj) {
      alert('เธเธฃเธธเธ“เธฒเนเธเธเธฃเธนเธเธชเธฅเธดเธเธเธฒเธฃเนเธญเธเน€เธเธดเธ'); return;
    }

    /* โ”€โ”€ Sanitize โ”€โ”€ */
    var nameEl  = document.getElementById('inp-name');
    var phoneEl = document.getElementById('inp-phone');
    var safeName  = sanitizeText(nameEl  ? nameEl.value  : appState.name  || '');
    var safePhone = sanitizePhone(phoneEl ? phoneEl.value : appState.phone || '');

    if (!safeName  || safeName.length < 2)  { alert('เธเธทเนเธญ-เธเธฒเธกเธชเธเธธเธฅเนเธกเนเธ–เธนเธเธ•เนเธญเธ'); return; }
    if (!isValidThaiPhone(safePhone))        { alert('เน€เธเธญเธฃเนเนเธ—เธฃเนเธกเนเธ–เธนเธเธ•เนเธญเธ (เธ•เนเธญเธเน€เธเนเธเน€เธเธญเธฃเนเนเธ—เธข 10 เธซเธฅเธฑเธ)'); return; }
    if (!appState.tripTime)                  { alert('เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเน€เธงเธฅเธฒเน€เธ”เธดเธเธ—เธฒเธ'); return; }
    if (!appState.originKey || !appState.destKey || appState.originKey === appState.destKey) {
      alert('เน€เธชเนเธเธ—เธฒเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ'); return;
    }

    /* โ”€โ”€ Date โ”€โ”€ */
    var dateVal = typeof global._serviceDateISO === 'function' ? global._serviceDateISO() : _todayISO();
    var assignmentPlan = global.SLTransitBookingAssignmentCenter
      && typeof global.SLTransitBookingAssignmentCenter.buildBookingAssignmentContract === 'function'
      ? global.SLTransitBookingAssignmentCenter.buildBookingAssignmentContract({
        resolvedAssignment: appState.tripAssignment || {},
        serviceDate: dateVal,
        departTime: appState.tripTime,
        originName: appState.originName
      })
      : { assignment: null };
    var assignmentContract = assignmentPlan.assignment || (appState.selectedTrip && appState.selectedTrip.assignment) || {
      assignmentSource: 'none',
      scheduleOnly: true,
      liveTrackingAvailable: false
    };

    /* โ”€โ”€ Capacity & Admin Close checks (via SLBookingCapacity) โ”€โ”€ */
    var CAP = global.SLBookingCapacity;
    if (CAP) {
      if (CAP.isClosedByAdmin(appState.originKey, appState.destKey, appState.tripTime)) {
        alert('เธฃเธญเธเธเธตเนเธเธ”เธฃเธฑเธเธชเธณเธฃเธญเธเธ—เธตเนเธเธฑเนเธเธชเธณเธซเธฃเธฑเธเน€เธชเนเธเธ—เธฒเธเธเธตเน'); return;
      }
      if (CAP.isTripFull(appState.originKey, appState.destKey, dateVal, appState.tripTime, appState.pax)) {
        alert('เธฃเธญเธเธเธตเนเน€เธ•เนเธกเนเธฅเนเธง เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธฃเธญเธเน€เธงเธฅเธฒเธญเธทเนเธ');
        if (typeof global.renderTrips === 'function') global.renderTrips();
        return;
      }
    }

    if (!canBook(dateVal, appState.tripTime)) {
      alert('เธฃเธญเธเน€เธงเธฅเธฒเธเธตเนเธเธดเธ”เธฃเธฑเธเธชเธณเธฃเธญเธเธ—เธตเนเธเธฑเนเธเนเธฅเนเธง (เน€เธเธดเธเน€เธงเธฅเธฒเธ—เธตเนเธเธณเธซเธเธ”)'); return;
    }

    /* โ”€โ”€ Pricing (server-side only) โ”€โ”€ */
    var serverPrice = computePriceServerSide(appState.originKey, appState.destKey);
    if (!(serverPrice > 0)) {
      alert('ยังไม่มีข้อมูล fareAmount จาก ERP Preview สำหรับคู่เส้นทางนี้');
      return;
    }
    var svcFee      = getServiceFeeTotal(appState.pax || 1);
    var totalFare   = serverPrice * (appState.pax || 1);
    var grandTotal  = totalFare + svcFee;

    /* โ”€โ”€ dupKey โ”€โ”€ */
    var dupKey = appState.originKey + '_' + appState.destKey + '_' + dateVal + '_' + appState.tripTime;

    /* โ”€โ”€ UI lock โ”€โ”€ */
    var btn = document.getElementById('btnConfirm');
    _submitLock   = true;
    _lastSubmitTs = now;
    if (btn) { btn.disabled = true; btn.textContent = 'โณ เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธ...'; }

    var db      = global._db;
    var storage = global._storage;
    var bookingPath = global.TEST_MODE ? 'testBookings/' : 'bookings/';
    var queuePath   = global.TEST_MODE ? 'testQueues/'   : 'queues/';
    var bookingSaved = false;

    /* โ”€โ”€ Step 1: dupKey check (เธเธฑเธเธเธญเธเธเนเธณ) โ”€โ”€ */
    db.ref(bookingPath).orderByChild('dupKey').equalTo(dupKey).once('value')
      .then(function(snap) {
        if (snap.exists()) {
          /* เธกเธตเธเธฒเธฃเธเธญเธเธเธตเนเธญเธขเธนเนเนเธฅเนเธง */
          var existing = null;
          snap.forEach(function(child) { if (!existing) existing = child.val(); });
          if (existing && existing.status !== 'cancelled') {
            var msg = global.TEST_MODE
              ? '[TEST] เธฃเธซเธฑเธชเธเธฒเธฃเธเธญเธเธเธตเนเธกเธตเธญเธขเธนเนเนเธฅเนเธง: ' + (existing.code || '')
              : 'เธเธธเธ“เนเธ”เนเธชเธณเธฃเธญเธเธ—เธตเนเธเธฑเนเธเน€เธ—เธตเนเธขเธงเธเธตเนเนเธงเนเนเธฅเนเธง เธฃเธซเธฑเธชเธเธญเธ: ' + (existing.code || '');
            alert(msg);
            throw new Error('DUPLICATE');
          }
        }
        /* Step 2: queue counter */
        if (btn) btn.textContent = 'โณ เธเธณเธฅเธฑเธเธเธฑเธ”เธเธดเธง...';
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
        if (btn) btn.textContent = 'โณ เธเธณเธฅเธฑเธเธเธญเธเธ—เธตเนเธเธฑเนเธ...';
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
        if (btn) btn.textContent = 'โณ เธเธณเธฅเธฑเธเธญเธฑเธเนเธซเธฅเธ”เธชเธฅเธดเธ...';
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
        if (btn) btn.textContent = 'โณ เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ...';
        var ti  = appState.transferInfo || null;
        var CAP = global.SLBookingCapacity;

        /* legSchedule โ€” เธ•เธฃเธเธเธฑเธ repo booking.html */
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
          pairKey:       appState.selectedTrip && appState.selectedTrip.pairKey || '',
          pairId:        appState.selectedTrip && appState.selectedTrip.pairId || '',
          canonicalPairKey: appState.selectedTrip && appState.selectedTrip.canonicalPairKey || '',
          fare:          grandTotal,
          fareAmount:    serverPrice,
          fareContract:  appState.selectedTrip && appState.selectedTrip.fareContract || null,
          paymentOwnership: appState.selectedTrip && appState.selectedTrip.paymentOwnership || 'sl_transit',
          externalPaymentRequired: appState.selectedTrip && appState.selectedTrip.externalPaymentRequired === true,
          referenceOnly: appState.selectedTrip && appState.selectedTrip.referenceOnly === true,
          payMethod:     global.PAYMENT_MODE,
          slipUploaded:  !!result.slipUrl,
          assignment:    assignmentContract
        });

        /* fields เธเธฃเธเน€เธซเธกเธทเธญเธ repo */
        booking.route            = (appState.originName || '') + ' โ’ ' + (appState.destName || '');
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
        /* booking.status เธ–เธนเธ set เนเธฅเนเธงเนเธ”เธข SLBookingBridge.buildBookingSnapshot() เธ”เนเธงเธข BOOKING_STATUS.AWAITING_PAYMENT */
        booking.dupKey           = dupKey;
        booking.queueNumber      = result.queueNum;
        booking.bookingSequenceNumber = result.queueNum;
        booking.legSchedule      = legSchedule;        /* โ เธ•เนเธญเธเธกเธตเธชเธณเธซเธฃเธฑเธ check_ticket */
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

        /* โ”€โ”€ Firebase write โ”€โ”€ */
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
        /* expose เนเธซเน downloadTicketImage เนเธ booking.html */
        global._lastBooking = booking;

        _grantTicketAccess(booking.code);

        /* verify slip โ€” non-blocking, update paymentStatus */
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
        if (btn) { btn.disabled = false; btn.textContent = 'โ… เธขเธทเธเธขเธฑเธเธเธฒเธฃเธเธณเธฃเธฐเน€เธเธดเธ โ€บ'; }

        /* CAPACITY_FULL โ€” release reservation เธ–เนเธฒเธกเธต */
        if (err && err.message === 'CAPACITY_FULL') {
          alert('เธฃเธญเธเธเธตเนเน€เธ•เนเธกเนเธฅเนเธง เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธฃเธญเธเน€เธงเธฅเธฒเธญเธทเนเธ');
          if (typeof global.renderTrips === 'function') global.renderTrips();
          return;
        }
        if (err && err.message === 'DUPLICATE')             return;
        if (err && err.message === 'QUEUE_ERROR')           { alert('เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เนเธเธเธฒเธฃเธเธฑเธเธเธดเธง เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน'); return; }
        if (err && err.message === 'STORAGE_UPLOAD_FAILED') { alert('เธญเธฑเธเนเธซเธฅเธ”เธชเธฅเธดเธเนเธกเนเธชเธณเน€เธฃเนเธ เธเธฃเธธเธ“เธฒเธ•เธฃเธงเธเธชเธญเธเธเธฒเธฃเน€เธเธทเนเธญเธกเธ•เนเธญ'); return; }
        console.error('[POS] submitBooking error', err);
        alert('เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”: ' + (err.message || 'เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเน'));
      });
  }

  global.submitBooking = submitBooking;

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [7] LINE OA NOTIFICATION
     production: Firebase Function sendLineOnBooking เธฃเธญเธ—เธตเน /bookings/{code}
     test: mock log เธฅเธ /test_line_logs
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
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
    /* production: Firebase Function เธเธฐ trigger เธญเธฑเธ•เนเธเธกเธฑเธ•เธดเธเธฒเธ /bookings/{code}.set() */
    return Promise.resolve({ success: true, server_trigger: 'bookings/{code}' });
  }

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [8] TICKET ACCESS + CHECKIN + NEW BOOKING
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
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
    if (!code) { alert('เนเธกเนเธเธเธฃเธซเธฑเธชเธ•เธฑเนเธง'); return; }
    try { sessionStorage.setItem('latestBooking', JSON.stringify(_lastBooking)); } catch(e){}
    var phone = sanitizePhone((global.state && global.state.phone) || '');
    window.location.href = 'check_ticket.html?code=' + encodeURIComponent(code)
      + '&phone=' + encodeURIComponent(phone)
      + '&v=' + Date.now();
  }

  function newBooking() {
    /* เธฃเธตเน€เธเนเธ• POS state */
    _slipFileObj = null; _slipUrl = ''; _lastBooking = null;
    _submitLock = false; _lastSubmitTs = 0;

    /* เธฃเธตเน€เธเนเธ• slip UI */
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

    /* delegate reset + navigate เนเธเธซเธเนเธฒ 1 */
    if (typeof global.resetBookingState === 'function') global.resetBookingState();
    if (typeof global.showPage === 'function') global.showPage(1);
    if (typeof global.renderTrips === 'function') global.renderTrips();
  }

  global.goCheckin  = goCheckin;
  global.newBooking = newBooking;

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [9] LINE IN-APP BROWSER DETECTION
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
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

  /* โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€
     [10] INIT โ€” เน€เธฃเธตเธขเธเธเธฒเธ booking.html เธซเธฅเธฑเธ Firebase init
  โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€โ”€ */
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
