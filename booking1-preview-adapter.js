/**
 * Booking1 preview adapter.
 * Overrides legacy inline Booking1 page functions so the page consumes
 * /preview/publishedSchedule through SLBookingBridge as a UI-only adapter.
 */
(function(global) {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function appState() {
    global.state = global.state || {};
    return global.state;
  }

  function serviceDateISO() {
    return typeof global._serviceDateISO === 'function'
      ? global._serviceDateISO()
      : new Date().toISOString().slice(0, 10);
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;');
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function selectDefaultDestination() {
    var state = appState();
    var options = global.SLBookingBridge.getDestinationOptions(state.originKey);
    if (!options.length) {
      state.destKey = '';
      state.destName = '';
      return;
    }
    var selected = options.filter(function(option) { return option.key === state.destKey; })[0] || options[0];
    state.destKey = selected.key;
    state.destName = selected.nameTh || selected.label || selected.key;
  }

  function resetSelectedTrip() {
    var state = appState();
    state.tripTime = '';
    state.tripLabel = '';
    state.tripFare = 0;
    state.tripAssignment = null;
    state.selectedTrip = null;
    state.isLeg2Dest = false;
    state.transferInfo = null;
  }

  function selectedTripAllowed() {
    var selected = appState().selectedTrip;
    return !!(selected && selected.bookingAllowed && !selected.fareMissing && !selected.externalPaymentRequired);
  }

  function fareText(trip) {
    if (trip.externalPaymentRequired) return 'ชำระภายนอก';
    if (trip.fareMissing) return 'รอข้อมูลราคา';
    return trip.fareAmount != null ? trip.fareAmount + ' บาท' : '-';
  }

  function tripNotes(trip) {
    var notes = (trip.disclaimers || []).slice();
    if (trip.externalPaymentRequired) notes.push('SL-Transit ไม่เก็บค่าโดยสารรายการนี้ ต้องชำระกับผู้ให้บริการภายนอก');
    if (trip.referenceOnly) notes.push('ข้อมูลอ้างอิง ยังไม่เปิดจองผ่าน Booking1');
    if (trip.fareMissing) notes.push('TODO contract: ' + trip.missingFareField);
    if (!trip.bookingAllowed && trip.disabledReason === 'preview_not_apply_ready') {
      notes.push('Preview ยังไม่ readyForApply จึงยังไม่เปิดสร้าง booking จริง');
    }
    return notes;
  }

  function tripBadges(trip) {
    var badges = '';
    if (trip.scheduleOnly) badges += '<span class="trip-time-badge badge-schedule">schedule only</span>';
    if (trip.displayBadgeTh) badges += '<span class="trip-time-badge badge-schedule">' + esc(trip.displayBadgeTh) + '</span>';
    if (trip.referenceOnly) badges += '<span class="trip-time-badge badge-schedule">reference</span>';
    if (trip.externalPaymentRequired) badges += '<span class="trip-time-badge badge-schedule">external pay</span>';
    if (trip.fareMissing) badges += '<span class="trip-time-badge badge-schedule">fare missing</span>';
    return badges;
  }

  function noteHtml(trip) {
    var notes = tripNotes(trip);
    return notes.length ? '<div class="ti-inline-note">' + notes.map(esc).join('<br>') + '</div>' : '';
  }

  function selectButton(trip, index, recommended) {
    var cls = recommended ? 'btn-select-recommend' : 'btn-select-compact';
    if (!trip.bookingAllowed) {
      return '<button class="select-trip-btn ' + cls + '" disabled>ยังไม่เปิดจอง</button>';
    }
    return '<button class="select-trip-btn ' + cls + '" onclick="goToPassenger(event,\'' +
      esc(trip.pickupTime) + '\',\'' + esc(trip.label) + '\',' + index + ')">' +
      (recommended ? 'เลือกเที่ยวนี้ ›' : 'เลือก ›') + '</button>';
  }

  function stopPickerItemsHtml(role, stops) {
    var currentGroup = null;
    return stops.map(function(s) {
      var html = '';
      var group = role === 'destination' ? (s.group || null) : null;
      if (group !== currentGroup) {
        currentGroup = group;
        if (group) {
          html += '<div class="stop-picker-item" style="font-size:12px;font-weight:800;color:#64748b;background:#f8fafc;cursor:default;">[' + esc(group) + ']</div>';
        }
      }
      html += '<div class="stop-picker-item" onclick="selectStop(\'' + role + '\',\'' + esc(s.key) + '\',\'' + esc(s.nameTh) + '\')">' + esc(s.nameTh) + '</div>';
      return html;
    }).join('');
  }

  function renderLoadedTrips(available) {
    var state = appState();
    var container = document.getElementById('tripList');
    if (!container) return;
    state._lastAvailable = available || [];
    resetSelectedTrip();

    if (!state.originKey || !state.destKey) {
      container.innerHTML = '<div class="no-trips-msg"><img class="icon-img" src="assets/244.png" alt="missing" style="width:54px;height:54px;margin:0 auto 10px;"><strong>ยังไม่มีตัวเลือกต้นทาง/ปลายทางจาก ERP Preview</strong><span>ต้องมี originOptions และ destinationOptionsByOrigin ก่อน</span></div>';
      return;
    }
    if (!available.length) {
      var status = global.SLBookingBridge.getDestinationContractStatus(state.originKey);
      container.innerHTML = '<div class="no-trips-msg"><img class="icon-img" src="assets/244.png" alt="no trips" style="width:54px;height:54px;margin:0 auto 10px;"><strong>ยังไม่มีเที่ยวสำหรับคู่เส้นทางนี้</strong><span>สถานะสัญญา: ' + esc(status) + '</span></div>';
      return;
    }

    var best = available[0];
    state.selectedTrip = best;
    state.tripTime = best.pickupTime;
    state.tripLabel = best.label;
    state.tripFare = best.fareAmount || 0;
    state.tripAssignment = best.assignment || null;
    state.isLeg2Dest = best.isLeg2 || false;
    state.transferInfo = best.transferInfo || null;

    var html = '<div class="trip-card trip-card-recommended selected" data-index="0" data-time="' + esc(best.pickupTime) + '" data-label="' + esc(best.label) + '" data-fare="' + (best.fareAmount || 0) + '" onclick="selectTrip(this)">'
      + '<div class="trip-card-head"><div class="trip-check">✓</div><div class="trip-time-wrap">'
      + '<span class="trip-time">' + esc(best.label) + '</span><span class="trip-time-badge badge-recommend">เที่ยวแนะนำ</span>'
      + tripBadges(best) + '</div></div>'
      + '<div class="trip-route-row"><img class="icon-img" src="assets/221.png" alt="stop" style="width:13px;height:13px;"><span class="trip-route-text">' + esc(state.originName || 'ต้นทาง') + ' → ' + esc(state.destName || 'ปลายทาง') + '</span></div>'
      + '<div class="trip-meta"><div class="trip-meta-item"><img class="icon-img" src="assets/241.png" alt="route" style="width:13px;height:13px;"> ERP Preview pair: ' + esc(best.pairKey || '-') + '</div><div class="trip-meta-item">No live vehicle tracking</div></div>'
      + noteHtml(best)
      + '<div class="trip-bottom"><div class="trip-price">' + fareText(best) + '</div>' + selectButton(best, 0, true) + '</div></div>';

    if (available.length > 1) {
      html += '<div class="all-trips-label">เที่ยวอื่น ๆ ในวันนี้</div>';
      available.slice(1).forEach(function(trip, offset) {
        var index = offset + 1;
        html += '<div class="trip-card trip-card-compact" data-index="' + index + '" data-time="' + esc(trip.pickupTime) + '" data-label="' + esc(trip.label) + '" data-fare="' + (trip.fareAmount || 0) + '" onclick="selectTrip(this)">'
          + '<div class="trip-check">✓</div><div class="trip-compact-row"><div class="trip-compact-left">'
          + '<span class="trip-time-compact">' + esc(trip.label) + '</span>' + tripBadges(trip)
          + '<div class="trip-compact-route">' + esc(state.originName || 'ต้นทาง') + ' → ' + esc(state.destName || 'ปลายทาง') + '</div>'
          + noteHtml(trip) + '</div><div class="trip-compact-right">'
          + '<span class="trip-price-compact">' + fareText(trip) + '</span>' + selectButton(trip, index, false)
          + '</div></div></div>';
      });
    }
    container.innerHTML = html;
  }

  function patch() {
    var onsiteNote = document.getElementById('onsite-payment-note');
    if (onsiteNote) {
      onsiteNote.textContent = 'สำรองที่นั่งเรียบร้อยแล้ว ชำระเงินเมื่อเดินทางหรือบนรถโดยสาร';
    }

    global._populateStopPicker = function() {
      var state = appState();
      var origins = global.SLBookingBridge.getBookableStops();
      if (!origins.length) return;
      var selected = origins.filter(function(option) { return option.key === state.originKey; })[0] || origins[0];
      state.originKey = selected.key;
      state.originName = selected.nameTh;
      selectDefaultDestination();
      setText('field-origin', state.originName);
      setText('field-dest', state.destName);
    };

    global.openStopPicker = function(role) {
      var state = appState();
      var stops = role === 'origin'
        ? global.SLBookingBridge.getBookableStops()
        : global.SLBookingBridge.getDestinationOptions(state.originKey);
      var overlay = document.createElement('div');
      overlay.id = 'stopPickerOverlay';
      overlay.className = 'stop-picker-overlay';
      overlay.onclick = function(e) { if (e.target === overlay) global.closeStopPicker(); };
      overlay.innerHTML = '<div class="stop-picker-box"><div class="stop-picker-title">' + (role === 'origin' ? 'เลือกต้นทาง' : 'เลือกปลายทาง') + '</div>'
        + stopPickerItemsHtml(role === 'origin' ? 'origin' : 'destination', stops) + '</div>';
      document.body.appendChild(overlay);
    };

    global.selectStop = function(role, key, nameTh) {
      var state = appState();
      if (role === 'origin') {
        state.originKey = key;
        state.originName = nameTh;
        selectDefaultDestination();
      } else {
        state.destKey = key;
        state.destName = nameTh;
      }
      setText('field-origin', state.originName);
      setText('field-dest', state.destName);
      resetSelectedTrip();
      global.closeStopPicker();
      global.renderTrips();
    };

    global.swapStops = function() {
      var state = appState();
      var oldOriginKey = state.originKey;
      var oldOriginName = state.originName;
      state.originKey = state.destKey;
      state.originName = state.destName;
      state.destKey = oldOriginKey;
      state.destName = oldOriginName;
      selectDefaultDestination();
      setText('field-origin', state.originName);
      setText('field-dest', state.destName);
      resetSelectedTrip();
      global.renderTrips();
    };

    global.renderTrips = function() {
      var state = appState();
      var container = document.getElementById('tripList');
      if (!container || !global.SLBookingBridge) return;
      var requestId = Date.now() + ':' + state.originKey + ':' + state.destKey;
      state._tripRenderRequestId = requestId;
      container.innerHTML = '<div class="no-trips-msg"><img class="icon-img" src="assets/244.png" alt="loading" style="width:54px;height:54px;margin:0 auto 10px;"><strong>กำลังโหลดเที่ยวจาก ERP Preview</strong><span>อ่านเฉพาะคู่เส้นทางที่เลือก</span></div>';
      global.SLBookingBridge.loadAvailableTrips(state.originKey, state.destKey, serviceDateISO()).then(function(available) {
        if (state._tripRenderRequestId !== requestId) return;
        renderLoadedTrips(available || []);
      }).catch(function(err) {
        console.error('[Booking1PreviewAdapter] load trips failed', err);
        container.innerHTML = '<div class="no-trips-msg"><img class="icon-img" src="assets/214.png" alt="error" style="width:54px;height:54px;margin:0 auto 10px;"><strong>โหลดข้อมูลเที่ยวไม่สำเร็จ</strong><span>ตรวจสอบ /preview/publishedSchedule/pairs/{pairKey}</span></div>';
      });
    };

    global.selectTrip = function(el) {
      document.querySelectorAll('.trip-card').forEach(function(card) { card.classList.remove('selected'); });
      el.classList.add('selected');
      var state = appState();
      var trip = (state._lastAvailable || [])[Number(el.dataset.index)];
      if (!trip) return;
      state.selectedTrip = trip;
      state.tripTime = trip.pickupTime;
      state.tripLabel = trip.label;
      state.tripFare = trip.fareAmount || 0;
      state.tripAssignment = trip.assignment || null;
      state.isLeg2Dest = trip.isLeg2 || false;
      state.transferInfo = trip.transferInfo || null;
    };

    global.demoGoToPassenger = function() {
      alert('ยังไม่มีเที่ยวจาก ERP Preview ให้เลือก');
    };

    global.goToPassenger = function(e, time, label, tripIndex) {
      if (e) e.stopPropagation();
      var state = appState();
      var trip = (state._lastAvailable || [])[Number(tripIndex)];
      if (!trip || !trip.bookingAllowed) {
        alert('เที่ยวนี้ยังไม่เปิดจองผ่าน Booking1');
        return;
      }
      state.selectedTrip = trip;
      state.tripTime = time;
      state.tripLabel = label;
      state.tripFare = trip.fareAmount || 0;
      state.tripAssignment = trip.assignment || null;
      state.isLeg2Dest = trip.isLeg2 || false;
      state.transferInfo = trip.transferInfo || null;
      if (typeof global.updateSummary === 'function') global.updateSummary();
      if (typeof global.showPage === 'function') global.showPage(2);
    };

    global.getBookingTotal = function(pax) {
      var state = appState();
      var selected = state.selectedTrip || {};
      var n = pax || state.pax || 1;
      var fareMissing = selected.fareMissing === true || selected.externalPaymentRequired === true;
      var base = fareMissing ? 0 : (Number(selected.fareAmount) || Number(state.tripFare) || 0);
      var svcFee = (global.SERVICE_FEE_ENABLED && global.SERVICE_FEE_AMOUNT) ? global.SERVICE_FEE_AMOUNT * n : 0;
      return { basePrice: base, svcFee: svcFee, total: base * n + svcFee, fareMissing: fareMissing };
    };

    global.goToPayment = function() {
      var state = appState();
      var nameEl = document.getElementById('inp-name');
      var phoneEl = document.getElementById('inp-phone');
      var nameVal = nameEl ? nameEl.value.trim() : '';
      var phoneVal = phoneEl ? phoneEl.value.trim() : '';
      if (!nameVal) { alert('กรุณากรอกชื่อ-นามสกุล'); return; }
      if (!phoneVal || !global.isValidThaiPhone(phoneVal)) { alert('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง'); return; }
      var terms = document.getElementById('terms-check');
      if (terms && !terms.checked) { alert('กรุณายอมรับเงื่อนไขการจองก่อน'); return; }
      if (!selectedTripAllowed()) { alert('เที่ยวนี้ยังไม่เปิดสร้าง booking จริง หรือยังไม่มี fareAmount'); return; }
      state.name = global.sanitizeText ? global.sanitizeText(nameVal) : nameVal;
      state.phone = global.sanitizePhone ? global.sanitizePhone(phoneVal) : phoneVal;
      var total = global.getBookingTotal(state.pax);
      if (total.fareMissing) { alert('ยังไม่มีข้อมูล fareAmount ใน preview pair สำหรับคู่เส้นทางนี้'); return; }
      state._totalFare = total.total;
      setText('sumRoute', (state.originName || '-') + ' - ' + (state.destName || '-'));
      setText('sumDate', typeof global._dateThaiShort === 'function' ? global._dateThaiShort() : serviceDateISO());
      setText('sumTime', state.tripLabel);
      setText('sumSeat', (state.pax || 1) + ' ที่นั่ง');
      setText('p3-name', state.name);
      setText('p3-phone', state.phone);
      setText('p3-ticket-price', (total.basePrice * (state.pax || 1)) + ' บาท');
      setText('sumServiceFee', total.svcFee + ' บาท');
      setText('sumTotal', total.total + ' บาท');
      setText('sumTotal2', total.total + ' บาท');
      setText('bank-amount', total.total + ' บาท');
      if (typeof global.showPage === 'function') global.showPage(3);
      if (typeof global.updateSteps === 'function') global.updateSteps(3);
      if (typeof global.selectPayMethod === 'function') global.selectPayMethod(null);
    };

    global.goToTicket = function() {
      var state = appState();
      if (!state.consentAccepted) { alert('กรุณายอมรับเงื่อนไขก่อน'); return; }
      if (!selectedTripAllowed()) { alert('เที่ยวนี้ยังไม่เปิดสร้าง booking จริง'); return; }
      var assignmentContract = (state.selectedTrip && state.selectedTrip.assignment) || {
        assignmentSource: 'none',
        scheduleOnly: true,
        liveTrackingAvailable: false
      };
      state.bookingCode = typeof global.generateBookingId === 'function' ? global.generateBookingId() : 'BK-' + Date.now();
      var bookingSnap = global.SLBookingBridge.buildBookingSnapshot({
        bookingCode: state.bookingCode,
        name: state.name || '-',
        phone: state.phone || '-',
        pax: state.pax || 1,
        originStopKey: state.originKey,
        destStopKey: state.destKey,
        pickupTime: state.tripTime,
        serviceDate: serviceDateISO(),
        pairKey: state.selectedTrip.pairKey || '',
        pairId: state.selectedTrip.pairId || '',
        canonicalPairKey: state.selectedTrip.canonicalPairKey || '',
        fare: state._totalFare || ((state.tripFare || 0) * (state.pax || 1)),
        fareAmount: state.tripFare || 0,
        fareContract: state.selectedTrip.fareContract || null,
        paymentOwnership: state.selectedTrip.paymentOwnership || 'sl_transit',
        externalPaymentRequired: state.selectedTrip.externalPaymentRequired === true,
        referenceOnly: state.selectedTrip.referenceOnly === true,
        payMethod: global.currentPayMethod || '',
        slipUploaded: !!state.slipFile,
        assignment: assignmentContract
      });
      console.log('[Booking1PreviewAdapter] snapshot ready:', bookingSnap.bookingCode, bookingSnap.publishedSchedule);
      setText('t-name', state.name || '-');
      setText('t-phone', state.phone || '-');
      setText('t-trip-time', state.tripLabel || '-');
      setText('t-pax', (state.pax || 1) + ' คน');
      setText('t-booking-code', state.bookingCode);
      var transferBox = document.getElementById('ticket-transfer-box');
      if (transferBox) transferBox.style.display = 'none';
      if (typeof global.showPage === 'function') global.showPage(4);
      if (typeof global.renderQr === 'function') {
        setTimeout(function() {
          global.renderQr('ticketQrCode', global.getTicketQrText(state.bookingCode), 160);
        }, 100);
      }
    };

    global.SLBooking1PreviewAdapter = { patched: true, renderLoadedTrips: renderLoadedTrips };
    if (global.SLBookingBridge && global.SLBookingBridge._preview && global.SLBookingBridge._preview.originOptions.length) {
      global._populateStopPicker();
      global.renderTrips();
    }
  }

  ready(function() {
    setTimeout(patch, 0);
  });
})(window);
