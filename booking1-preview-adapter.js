/**
 * Booking1 preview adapter.
 * Overrides legacy inline Booking1 page functions so the page consumes
 * /publishedSchedule through SLBookingBridge as a UI-only adapter.
 */
(function(global) {
  'use strict';

  var LINE_LOGIN_PENDING_KEY = 'slTransitBooking1LineLoginPending';

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

  function selectedTripCanContinue() {
    var selected = appState().selectedTrip;
    return !!(selected && selected.selectionAllowed && !selected.fareMissing && !selected.externalPaymentRequired);
  }

  function bookingCode() {
    return 'BK' + String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 90) + 10);
  }

  function withoutUndefined(value) {
    if (Array.isArray(value)) {
      return value.map(withoutUndefined).filter(function(item) { return item !== undefined; });
    }
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function(key) {
        var cleaned = withoutUndefined(value[key]);
        if (cleaned !== undefined) out[key] = cleaned;
      });
      return out;
    }
    return value === undefined ? undefined : value;
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
    return notes;
  }

  function tripBadges(trip) {
    var badges = '';
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

  function transferPointText(trip) {
    var ti = trip && trip.transferInfo || {};
    return ti.viaLabel || ti.transferNodeLabel || ti.transferStopLabel || ti.point ||
      ti.transferPoint || ti.connectionPointLabel || ti.stopLabel || '';
  }

  function finalDestinationText(trip) {
    var ti = trip && trip.transferInfo || {};
    return ti.destLabel || appState().destName || '';
  }

  function routeText(trip) {
    var state = appState();
    var origin = state.originName || '\u0e15\u0e49\u0e19\u0e17\u0e32\u0e07';
    var destination = finalDestinationText(trip) || state.destName || '\u0e1b\u0e25\u0e32\u0e22\u0e17\u0e32\u0e07';
    var transfer = transferPointText(trip);
    if (trip && trip.isLeg2 && transfer) {
      return esc(origin) + ' &rarr; ' + esc(transfer) + ' &rarr; ' + esc(destination);
    }
    return esc(origin) + ' &rarr; ' + esc(state.destName || destination);
  }

  function transferDetailHtml(trip) {
    if (!trip || !trip.isLeg2) return '';
    var ti = trip.transferInfo || {};
    var transfer = transferPointText(trip);
    var rows = [];
    if (transfer) rows.push('<div class="trip-transfer-line"><img class="icon-img" src="assets/241.png" alt="transfer"><span>\u0e15\u0e48\u0e2d\u0e23\u0e16\u0e17\u0e35\u0e48 ' + esc(transfer) + '</span></div>');
    if (ti.nextDepartureTime || ti.leg2Time) rows.push('<div class="trip-transfer-line"><img class="icon-img" src="assets/242.png" alt="next trip"><span>\u0e23\u0e16\u0e15\u0e48\u0e2d ' + esc(ti.nextDepartureTime || ti.leg2Time) + ' \u0e19.</span></div>');
    if (ti.waitMinutes != null) rows.push('<div class="trip-transfer-line"><img class="icon-img" src="assets/243.png" alt="wait"><span>\u0e23\u0e2d\u0e15\u0e48\u0e2d\u0e23\u0e16\u0e1b\u0e23\u0e30\u0e21\u0e32\u0e13 ' + esc(ti.waitMinutes) + ' \u0e19\u0e32\u0e17\u0e35</span></div>');
    return rows.length ? '<div class="trip-transfer-detail">' + rows.join('') + '</div>' : '';
  }

  function transferPoint(state) {
    var ti = state && state.transferInfo || {};
    return ti.viaLabel || ti.transferNodeLabel || ti.transferStopLabel || ti.point ||
      ti.transferPoint || ti.connectionPointLabel || ti.stopLabel || '';
  }

  function buildLegSchedule(state) {
    var origin = state.originName || '';
    var destination = state.destName || '';
    var transfer = transferPoint(state);
    var ti = state.transferInfo || {};
    if (state.isLeg2Dest && transfer) {
      return {
        leg1: origin + ' - ' + transfer,
        leg1Time: state.tripTime || '',
        leg2: transfer + ' - ' + (ti.destLabel || destination),
        leg2Time: ti.nextDepartureTime || ti.leg2Time || ''
      };
    }
    return {
      leg1: origin + ' - ' + destination,
      leg1Time: state.tripTime || '',
      leg2: '',
      leg2Time: ''
    };
  }

  function identityCenter() {
    return global.SLTransitPassengerIdentityCenter || null;
  }

  function isLinePassenger(state) {
    var center = identityCenter();
    return !!(center && center.isLineIdentity(state.passengerIdentity));
  }

  function guestPassengerIdentity(name, phone) {
    var center = identityCenter();
    if (center && typeof center.guestIdentity === 'function') return center.guestIdentity(name, phone);
    return { provider: 'guest', status: 'manual', displayName: name || '', phone: phone || '' };
  }

  function guestNotificationPreference() {
    var center = identityCenter();
    if (center && typeof center.guestNotificationPreference === 'function') return center.guestNotificationPreference();
    return { lineTicket: false, lineTripUpdates: false };
  }

  function lineNotificationPreference() {
    var center = identityCenter();
    if (center && typeof center.lineNotificationPreference === 'function') return center.lineNotificationPreference();
    return { lineTicket: true, lineTripUpdates: true };
  }

  function buildLineConsent() {
    var center = identityCenter();
    if (center && typeof center.buildConsent === 'function') return center.buildConsent('booking1.html');
    return null;
  }

  function currentPassengerIdentity(state) {
    syncLineIdentityState(state, false);
    if (isLinePassenger(state)) return state.passengerIdentity;
    return guestPassengerIdentity(state.name || '', state.phone || '');
  }

  function currentNotificationPreference(state) {
    syncLineIdentityState(state, false);
    if (isLinePassenger(state)) return state.notificationPreference || lineNotificationPreference();
    return state.notificationPreference || guestNotificationPreference();
  }

  function currentConsent(state) {
    return state.consent || null;
  }

  function pendingStorage() {
    try { return global.sessionStorage || null; } catch (err) { return null; }
  }

  function readPendingLineBookingState() {
    var storage = pendingStorage();
    if (!storage) return null;
    try {
      var raw = storage.getItem(LINE_LOGIN_PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      storage.removeItem(LINE_LOGIN_PENDING_KEY);
      return null;
    }
  }

  function clearPendingLineBookingState() {
    var storage = pendingStorage();
    if (storage) storage.removeItem(LINE_LOGIN_PENDING_KEY);
  }

  function savePendingLineBookingState(state) {
    var storage = pendingStorage();
    if (!storage) return;
    storage.setItem(LINE_LOGIN_PENDING_KEY, JSON.stringify({
      createdAt: Date.now(),
      originKey: state.originKey || '',
      originName: state.originName || '',
      destKey: state.destKey || '',
      destName: state.destName || '',
      pax: state.pax || 1,
      selectedDate: serviceDateISO(),
      tripTime: state.tripTime || '',
      tripLabel: state.tripLabel || '',
      tripFare: state.tripFare || 0,
      selectedTrip: state.selectedTrip || null,
      isLeg2Dest: state.isLeg2Dest === true,
      transferInfo: state.transferInfo || null
    }));
  }

  function applyPendingLineBookingState(pending) {
    if (!pending) return;
    var state = appState();
    if (pending.originKey) state.originKey = pending.originKey;
    if (pending.originName) state.originName = pending.originName;
    if (pending.destKey) state.destKey = pending.destKey;
    if (pending.destName) state.destName = pending.destName;
    state.pax = pending.pax || state.pax || 1;
    if (pending.selectedDate) state.selectedDate = new Date(pending.selectedDate + 'T00:00:00');
    if (pending.selectedTrip) state.selectedTrip = pending.selectedTrip;
    state.tripTime = pending.tripTime || (state.selectedTrip && state.selectedTrip.pickupTime) || state.tripTime || '';
    state.tripLabel = pending.tripLabel || (state.selectedTrip && state.selectedTrip.label) || state.tripLabel || '';
    state.tripFare = pending.tripFare || (state.selectedTrip && state.selectedTrip.fareAmount) || state.tripFare || 0;
    state.tripAssignment = state.selectedTrip && state.selectedTrip.assignment || null;
    state.isLeg2Dest = pending.isLeg2Dest === true || (state.selectedTrip && state.selectedTrip.isLeg2 === true);
    state.transferInfo = pending.transferInfo || (state.selectedTrip && state.selectedTrip.transferInfo) || null;
    setText('field-origin', state.originName);
    setText('field-dest', state.destName);
    setText('seatCount', state.pax);
    setText('pax-count', state.pax + ' เธเธ');
    setText('search-pax-count', state.pax + ' เธเธ โ–พ');
  }

  function showPaymentPageAfterLineIdentity(identity) {
    var state = appState();
    state.passengerIdentity = identity;
    state.notificationPreference = lineNotificationPreference();
    state.consent = buildLineConsent();
    state.name = identity.displayName || 'LINE passenger';
    state.phone = '';
    state.consentAccepted = true;
    var nameEl = document.getElementById('inp-name');
    var phoneEl = document.getElementById('inp-phone');
    var phoneError = document.getElementById('phoneError');
    if (nameEl) nameEl.value = state.name;
    if (phoneEl) phoneEl.value = '';
    if (phoneError) phoneError.style.display = 'none';
    renderLineIdentity(identity);
    enforceSeparatePaymentStep();
    if (!preparePassengerAndPayment(true)) return false;
    if (typeof global.showPage === 'function') global.showPage(3);
    if (typeof global.updateSteps === 'function') global.updateSteps(3);
    if (typeof global.selectPayMethod === 'function' && !global.currentPayMethod) global.selectPayMethod('onsite');
    return true;
  }

  function syncLineIdentityState(state, render) {
    var center = identityCenter();
    var identity = center && typeof center.getCurrentIdentity === 'function'
      ? center.getCurrentIdentity()
      : null;
    if (center && center.isLineIdentity(identity)) {
      state.passengerIdentity = identity;
      state.notificationPreference = lineNotificationPreference();
      state.consent = state.consent || buildLineConsent();
      state.consentAccepted = true;
      if (render !== false) renderLineIdentity(identity);
      return true;
    }
    if (state.passengerIdentity && state.passengerIdentity.provider === 'line') {
      state.passengerIdentity = null;
      state.notificationPreference = guestNotificationPreference();
      state.consent = null;
      state.consentAccepted = false;
    }
    if (render !== false) renderLineIdentity(null);
    return false;
  }

  function resumePendingLineLogin() {
    var state = appState();
    if (state._lineLoginResumeAttempted) return;
    var pending = readPendingLineBookingState();
    if (!pending) return;
    if (Date.now() - Number(pending.createdAt || 0) > 10 * 60 * 1000) {
      clearPendingLineBookingState();
      return;
    }
    var center = identityCenter();
    if (!center || typeof center.completeLineLogin !== 'function') return;
    state._lineLoginResumeAttempted = true;
    applyPendingLineBookingState(pending);
    setLineIdentityStatus('กำลังกลับเข้าสู่รายการจองเดิม...', true);
    center.completeLineLogin().then(function(identity) {
      if (!identity) {
        setLineIdentityStatus('ถ้าไม่ล็อกอิน สามารถกรอกชื่อและเบอร์โทรตามปกติได้', false);
        return;
      }
      applyPendingLineBookingState(pending);
      if (showPaymentPageAfterLineIdentity(identity)) clearPendingLineBookingState();
    }).catch(function(err) {
      setLineIdentityStatus('เข้าสู่ระบบ LINE ไม่สำเร็จ กรุณาลองใหม่ หรือกรอกข้อมูลเองได้', false);
      console.error('[Booking1PreviewAdapter] LINE login resume failed', err);
    });
  }

  function setLineIdentityStatus(message, busy) {
    var status = document.getElementById('lineIdentityStatus');
    var btn = document.getElementById('lineLoginBtn');
    if (status) status.textContent = message || '';
    if (btn) btn.disabled = busy === true;
  }

  function renderLineIdentity(identity) {
    var profile = document.getElementById('lineIdentityProfile');
    var avatar = document.getElementById('lineIdentityAvatar');
    var name = document.getElementById('lineIdentityName');
    if (!profile) return;
    if (identity && identity.provider === 'line' && identity.lineUserId) {
      profile.style.display = 'flex';
      if (avatar) {
        avatar.src = identity.pictureUrl || '';
        avatar.style.display = identity.pictureUrl ? 'block' : 'none';
      }
      if (name) name.textContent = identity.displayName || 'LINE passenger';
      setLineIdentityStatus('ใช้ข้อมูลจาก LINE แล้ว ระบบจะส่งตั๋วและแจ้งเตือนรายการนี้ผ่าน LINE', false);
    } else {
      profile.style.display = 'none';
      setLineIdentityStatus('ถ้าไม่ล็อกอิน สามารถกรอกชื่อและเบอร์โทรตามปกติได้', false);
    }
  }

  function fillPaymentSummary(state, total) {
    setText('sumRoute', (state.originName || '-') + ' - ' + (state.destName || '-'));
    setText('sumDate', typeof global._dateThaiShort === 'function' ? global._dateThaiShort() : serviceDateISO());
    setText('sumTime', state.tripLabel);
    setText('sumSeat', (state.pax || 1) + ' เธ—เธตเนเธเธฑเนเธ');
    setText('p3-name', state.name);
    setText('p3-phone', state.phone || '-');
    setText('p3-ticket-price', (total.basePrice * (state.pax || 1)) + ' เธเธฒเธ—');
    setText('sumServiceFee', total.svcFee + ' เธเธฒเธ—');
    setText('sumTotal', total.total + ' เธเธฒเธ—');
    setText('sumTotal2', total.total + ' เธเธฒเธ—');
    setText('bank-amount', total.total + ' เธเธฒเธ—');
  }

  function continueToPayment(state) {
    if (!selectedTripCanContinue()) { alert('เน€เธ—เธตเนเธขเธงเธเธตเนเธขเธฑเธเนเธเธ•เนเธญเนเธกเนเนเธ”เน เธซเธฃเธทเธญเธขเธฑเธเนเธกเนเธกเธต fareAmount เธเธฒเธ ERP Data Center'); return; }
    var total = global.getBookingTotal(state.pax);
    if (total.fareMissing) { alert('เธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธกเธนเธฅ fareAmount เนเธ preview pair เธชเธณเธซเธฃเธฑเธเธเธนเนเน€เธชเนเธเธ—เธฒเธเธเธตเน'); return; }
    state._totalFare = total.total;
    state.passengerIdentity = currentPassengerIdentity(state);
    state.notificationPreference = currentNotificationPreference(state);
    fillPaymentSummary(state, total);
    if (typeof global.showPage === 'function') global.showPage(3);
    if (typeof global.updateSteps === 'function') global.updateSteps(3);
    if (typeof global.selectPayMethod === 'function') global.selectPayMethod(null);
  }

  function legacyBookingPayload(state, snapshot) {
    var selected = state.selectedTrip || {};
    var total = global.getBookingTotal ? global.getBookingTotal(state.pax) : null;
    if (!total || total.status !== 'ready') throw new Error('booking_total_not_ready');
    var legSchedule = buildLegSchedule(state);
    var assignment = snapshot.assignment || {};
    var transfer = transferPoint(state);
    var route = (state.originName || '') + ' \u2192 ' + (state.destName || '');
    return Object.assign({}, snapshot, {
      code: snapshot.bookingCode,
      bookingCode: snapshot.bookingCode,
      source: 'booking1.html',
      sourceMode: 'erp_data_center',
      name: snapshot.name,
      phone: snapshot.phone,
      route: route,
      origin: state.originName || '',
      destination: state.destName || '',
      date: snapshot.serviceDate,
      time: snapshot.pickupTime,
      departTime: snapshot.pickupTime,
      pickupTime: snapshot.pickupTime,
      seats: snapshot.pax,
      pax: snapshot.pax,
      price: total.totalAmount,
      fare: total.fareSubtotal,
      serviceFee: total.serviceFeeTotal,
      paymentMode: snapshot.payMethod || '',
      paymentStatus: snapshot.payMethod === 'onsite' ? 'pay_on_site' : (snapshot.slipUploaded ? 'slip_uploaded' : 'awaiting_payment'),
      slipUploaded: snapshot.slipUploaded === true,
      testMode: false,
      mockPayment: false,
      routeId: selected.routeId || '',
      tripId: selected.tripId || '',
      catalogRouteId: selected.routeId || '',
      catalogTripId: selected.tripId || '',
      catalogFare: total.fareAmount,
      leg1Route: legSchedule.leg1,
      leg1Time: legSchedule.leg1Time,
      leg2Route: legSchedule.leg2,
      leg2Time: legSchedule.leg2Time,
      legSchedule: legSchedule,
      requiresTransfer: state.isLeg2Dest === true,
      transfer: state.transferInfo || null,
      transferInfo: state.transferInfo || null,
      transferPoint: transfer,
      queueNo: assignment.queueId || '',
      plannedVehicleId: assignment.vehicleId || '',
      scheduleOnly: assignment.scheduleOnly === true,
      noLiveTracking: assignment.liveTrackingAvailable !== true,
      assignmentSource: assignment.assignmentSource || 'none',
      ticketQrVersion: 'SLT1',
      passengerIdentity: snapshot.passengerIdentity || currentPassengerIdentity(state),
      notificationPreference: snapshot.notificationPreference || currentNotificationPreference(state),
      consent: snapshot.consent || currentConsent(state),
      originCheckin: { status: 'pending', identityVerified: false },
      status: snapshot.status || 'awaiting_payment',
      ts: global.firebase && global.firebase.database ? global.firebase.database.ServerValue.TIMESTAMP : Date.now()
    });
  }

  function preparePassengerAndPayment(allowEmptyPassenger) {
    var state = appState();
    syncLineIdentityState(state, true);
    var nameEl = document.getElementById('inp-name');
    var phoneEl = document.getElementById('inp-phone');
    var nameVal = nameEl ? nameEl.value.trim() : '';
    var phoneVal = phoneEl ? phoneEl.value.trim() : '';
    var linePassenger = isLinePassenger(state);
    if (linePassenger) {
      state.name = state.passengerIdentity.displayName || (nameVal && global.sanitizeText ? global.sanitizeText(nameVal) : nameVal) || 'LINE passenger';
      state.phone = phoneVal && global.sanitizePhone ? global.sanitizePhone(phoneVal) : '';
      state.notificationPreference = lineNotificationPreference();
      state.consent = state.consent || buildLineConsent();
      state.consentAccepted = true;
    } else if (!allowEmptyPassenger) {
      if (!nameVal) { alert('กรุณากรอกชื่อ-นามสกุล'); return false; }
      if (!phoneVal || !global.isValidThaiPhone(phoneVal)) { alert('กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง'); return false; }
      state.name = global.sanitizeText ? global.sanitizeText(nameVal) : nameVal;
      state.phone = global.sanitizePhone ? global.sanitizePhone(phoneVal) : phoneVal;
      state.passengerIdentity = guestPassengerIdentity(state.name, state.phone);
      state.notificationPreference = guestNotificationPreference();
      state.consent = null;
    } else {
      state.name = nameVal && global.sanitizeText ? global.sanitizeText(nameVal) : nameVal;
      state.phone = phoneVal && global.sanitizePhone ? global.sanitizePhone(phoneVal) : phoneVal;
      state.passengerIdentity = guestPassengerIdentity(state.name, state.phone);
      state.notificationPreference = guestNotificationPreference();
      state.consent = null;
    }
    if (!selectedTripCanContinue()) { alert('เที่ยวนี้ยังไปต่อไม่ได้ หรือยังไม่มี fareAmount จาก ERP Data Center'); return false; }
    var total = global.getBookingTotal(state.pax);
    if (total.status !== 'ready') { alert('ERP Calculator Center ยังไม่พร้อมคำนวณยอดสำหรับรายการนี้'); return false; }
    state._totalFare = total.total;
    setText('sumRoute', (state.originName || '-') + ' - ' + (state.destName || '-'));
    setText('sumDate', typeof global._dateThaiShort === 'function' ? global._dateThaiShort() : serviceDateISO());
    setText('sumTime', state.tripLabel);
    setText('sumSeat', (state.pax || 1) + ' ที่นั่ง');
    setText('p3-name', state.name || '-');
    setText('p3-phone', state.phone || '-');
    setText('p3-ticket-price', total.fareSubtotal + ' บาท');
    setText('sumServiceFee', total.svcFee + ' บาท');
    setText('sumTotal', total.total + ' บาท');
    setText('sumTotal2', total.total + ' บาท');
    setText('bank-amount', total.total + ' บาท');
    return true;
  }

  function enforceSeparatePaymentStep() {
    var page2 = document.getElementById('page2');
    var page3Container = document.querySelector('#page3 .content .page-container');
    if (!page2 || !page3Container) return;

    var legacyMount = document.getElementById('page2PaymentMount');
    if (legacyMount) {
      while (legacyMount.firstElementChild) {
        page3Container.appendChild(legacyMount.firstElementChild);
      }
      if (legacyMount.parentElement) legacyMount.parentElement.removeChild(legacyMount);
    }

    ['pm-onsite','pm-bank','pm-promptpay','btnConfirm','consentStatusBar','consentTriggerBtn','confirmNote','slipUploadCard'].forEach(function(id) {
      var node = document.getElementById(id);
      if (node && page2.contains(node)) page3Container.appendChild(node);
    });

    var formSection = document.querySelector('#page2 .form-section');
    if (formSection && !formSection.querySelector('button[onclick="goToPayment()"]')) {
      var next = document.createElement('button');
      next.className = 'btn-main';
      next.setAttribute('onclick', 'goToPayment()');
      next.textContent = 'ถัดไป ›';
      formSection.appendChild(next);
    }
  }

  function selectButton(trip, index, recommended) {
    var cls = recommended ? 'btn-select-recommend' : 'btn-select-compact';
    if (!trip.selectionAllowed) {
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
      container.innerHTML = '<div class="no-trips-msg"><img class="icon-img" src="assets/244.png" alt="missing" style="width:54px;height:54px;margin:0 auto 10px;"><strong>ยังไม่มีตัวเลือกต้นทาง/ปลายทางจากข้อมูลกลาง</strong><span>ต้องมี originOptions และ destinationOptionsByOrigin ก่อน</span></div>';
      return;
    }
    if (!available.length) {
      var status = global.SLBookingBridge.getDestinationContractStatus(state.originKey);
      container.innerHTML = '<div class="no-trips-msg"><img class="icon-img" src="assets/244.png" alt="no trips" style="width:54px;height:54px;margin:0 auto 10px;"><strong>ยังไม่มีเที่ยวสำหรับคู่เส้นทางนี้</strong><span>สถานะสัญญา: ' + esc(status) + '</span></div>';
      return;
    }

    function cardClass(trip, base) {
      return base + (trip.displayMuted ? ' trip-card-muted' : '');
    }
    function compactCard(trip, index) {
      return '<div class="' + cardClass(trip, 'trip-card trip-card-compact') + '" data-index="' + index + '" data-time="' + esc(trip.pickupTime) + '" data-label="' + esc(trip.label) + '" data-fare="' + (trip.fareAmount || 0) + '" onclick="selectTrip(this)">'
        + '<div class="trip-compact-row"><div class="trip-compact-left">'
        + '<span class="trip-time-compact">' + esc(trip.label) + '</span>' + tripBadges(trip)
        + '<div class="trip-compact-route">' + routeText(trip) + '</div>'
        + transferDetailHtml(trip)
        + noteHtml(trip) + '</div><div class="trip-compact-right">'
        + '<span class="trip-price-compact">' + fareText(trip) + '</span>' + selectButton(trip, index, false)
        + '</div></div></div>';
    }

    var recommendedIndex = available.findIndex(function(trip) { return trip && trip.recommended === true; });
    var best = recommendedIndex >= 0 ? available[recommendedIndex] : null;
    if (!best) {
      container.innerHTML = '<div class="all-trips-label">เที่ยวทั้งหมดในวันนี้</div>' + available.map(compactCard).join('');
      return;
    }

    state.selectedTrip = best;
    state.tripTime = best.pickupTime;
    state.tripLabel = best.label;
    state.tripFare = best.fareAmount || 0;
    state.tripAssignment = best.assignment || null;
    state.isLeg2Dest = best.isLeg2 || false;
    state.transferInfo = best.transferInfo || null;

    var html = '<div class="' + cardClass(best, 'trip-card trip-card-recommended selected') + '" data-index="' + recommendedIndex + '" data-time="' + esc(best.pickupTime) + '" data-label="' + esc(best.label) + '" data-fare="' + (best.fareAmount || 0) + '" onclick="selectTrip(this)">'
      + '<div class="trip-card-head"><div class="trip-time-wrap">'
      + '<span class="trip-time">' + esc(best.label) + '</span><span class="trip-time-badge badge-recommend">เที่ยวแนะนำ</span>'
      + tripBadges(best) + '</div></div>'
      + '<div class="trip-route-row"><img class="icon-img" src="assets/221.png" alt="stop" style="width:13px;height:13px;"><span class="trip-route-text">' + routeText(best) + '</span></div>'
      + transferDetailHtml(best)
      + noteHtml(best)
      + '<div class="trip-bottom"><div class="trip-price">' + fareText(best) + '</div>' + selectButton(best, recommendedIndex, true) + '</div></div>';

    if (available.length > 1) {
      html += '<div class="all-trips-label">เที่ยวอื่น ๆ ในวันนี้</div>';
      available.forEach(function(trip, index) {
        if (index !== recommendedIndex) html += compactCard(trip, index);
      });
    }
    container.innerHTML = html;
  }

  function initializeRouteAndTrips() {
    if (!global.SLBookingBridge || !global.SLBookingBridge._preview || !global.SLBookingBridge._preview.originOptions.length) {
      return false;
    }
    global._populateStopPicker();
    if (typeof global._updateDateDisplay === 'function') global._updateDateDisplay();
    global.renderTrips();
    return true;
  }

  function patch() {
    enforceSeparatePaymentStep();
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
      container.innerHTML = '<div class="no-trips-msg"><img class="icon-img" src="assets/244.png" alt="loading" style="width:54px;height:54px;margin:0 auto 10px;"><strong>กำลังโหลดเที่ยวจากข้อมูลกลาง</strong><span>อ่านเฉพาะคู่เส้นทางที่เลือก</span></div>';
      global.SLBookingBridge.loadAvailableTrips(state.originKey, state.destKey, serviceDateISO()).then(function(available) {
        if (state._tripRenderRequestId !== requestId) return;
        renderLoadedTrips(available || []);
        resumePendingLineLogin();
      }).catch(function(err) {
        console.error('[Booking1PreviewAdapter] load trips failed', err);
        container.innerHTML = '<div class="no-trips-msg"><img class="icon-img" src="assets/214.png" alt="error" style="width:54px;height:54px;margin:0 auto 10px;"><strong>โหลดข้อมูลเที่ยวไม่สำเร็จ</strong><span>ตรวจสอบ /publishedSchedule/pairs/{pairKey}</span></div>';
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
      alert('ยังไม่มีเที่ยวจากข้อมูลกลางให้เลือก');
    };

    global.goToPassenger = function(e, time, label, tripIndex) {
      enforceSeparatePaymentStep();
      if (e) e.stopPropagation();
      var state = appState();
      var trip = (state._lastAvailable || [])[Number(tripIndex)];
      if (!trip || !trip.selectionAllowed) {
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
      var calculator = global.SLTransitCalculatorCenter;
      var limit = global.SLBookingBridge.getBookingSeatLimit(selected);
      var publicLimit = Number(global.PUBLIC_BOOKING_PAX_LIMIT || 10);
      var effectiveLimit = Number(limit) > 0 ? Math.min(Number(limit), publicLimit) : publicLimit;
      if (fareMissing || !calculator || typeof calculator.calculateBookingTotal !== 'function') {
        return { status: 'missing_calculator_contract', total: null, fareMissing: fareMissing };
      }
      var result = calculator.calculateBookingTotal({
        fareAmount: selected.fareAmount,
        serviceFeeAmount: selected.fareContract && selected.fareContract.serviceFeeAmount,
        passengerCount: n,
        maxPassengers: effectiveLimit
      });
      return Object.assign({}, result, {
        basePrice: result.fareAmount,
        svcFee: result.serviceFeeTotal,
        total: result.totalAmount,
        fareMissing: result.status === 'missing_fare'
      });
    };

    global.goToPayment = function() {
      enforceSeparatePaymentStep();
      if (!preparePassengerAndPayment(false)) return;
      if (typeof global.showPage === 'function') global.showPage(3);
      if (typeof global.updateSteps === 'function') global.updateSteps(3);
      if (typeof global.selectPayMethod === 'function' && !global.currentPayMethod) global.selectPayMethod('onsite');
    };

    global.loginBookingLineIdentity = function(event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      var state = appState();
      var center = identityCenter();
      if (!center || typeof center.loginWithLine !== 'function') {
        setLineIdentityStatus('ยังไม่พร้อมใช้งาน LINE Login', false);
        alert('ยังไม่พร้อมใช้งาน LINE Login');
        return;
      }
      setLineIdentityStatus('กำลังเข้าสู่ระบบ LINE...', true);
      savePendingLineBookingState(state);
      center.loginWithLine().then(function(identity) {
        if (!identity) return;
        if (showPaymentPageAfterLineIdentity(identity)) clearPendingLineBookingState();
      }).catch(function(err) {
        var code = err && err.code || '';
        if (code === 'LINE_LOGIN_NOT_CONFIGURED') {
          setLineIdentityStatus('ยังไม่ได้ตั้งค่า LINE LIFF ID สำหรับ Booking1', false);
          alert('ยังไม่ได้ตั้งค่า LINE LIFF ID สำหรับ Booking1');
          return;
        }
        setLineIdentityStatus('เข้าสู่ระบบ LINE ไม่สำเร็จ กรุณาลองใหม่ หรือกรอกข้อมูลเองได้', false);
        alert('เข้าสู่ระบบ LINE ไม่สำเร็จ กรุณาลองใหม่');
        console.error('[Booking1PreviewAdapter] LINE login failed', err);
      });
    };

    global.goToTicket = function() {
      enforceSeparatePaymentStep();
      var state = appState();
      if (state._bookingSubmitInFlight) { alert('กำลังบันทึกการจอง กรุณารอสักครู่'); return; }
      if (!preparePassengerAndPayment(false)) return;
      if (!state.consentAccepted) { alert('กรุณายอมรับเงื่อนไขก่อน'); return; }
      if (!selectedTripCanContinue()) { alert('เที่ยวนี้ยังไปต่อไม่ได้'); return; }
      if (!global.currentPayMethod && typeof global.selectPayMethod === 'function') global.selectPayMethod('onsite');
      var db = global._db || (global.firebase && global.firebase.database && global.firebase.database());
      var total = global.getBookingTotal ? global.getBookingTotal(state.pax) : null;
      if (!total || total.status !== 'ready') { alert('ERP Calculator Center ยังไม่พร้อมคำนวณยอดสำหรับรายการนี้'); return; }
      state._totalFare = total.total;
      if (!db) { alert('ยังเชื่อมต่อฐานข้อมูลไม่ได้ กรุณาลองใหม่'); return; }
      var assignmentContract = (state.selectedTrip && state.selectedTrip.assignment) || {
        assignmentSource: 'none',
        scheduleOnly: true,
        liveTrackingAvailable: false
      };
      state.bookingCode = bookingCode();
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
        fare: total.totalAmount,
        fareAmount: total.fareAmount,
        fareContract: state.selectedTrip.fareContract || null,
        paymentOwnership: state.selectedTrip.paymentOwnership || 'sl_transit',
        externalPaymentRequired: state.selectedTrip.externalPaymentRequired === true,
        referenceOnly: state.selectedTrip.referenceOnly === true,
        payMethod: global.currentPayMethod || '',
        slipUploaded: global.currentPayMethod === 'onsite' ? false : !!state.slipFile,
        passengerIdentity: currentPassengerIdentity(state),
        notificationPreference: currentNotificationPreference(state),
        consent: currentConsent(state),
        assignment: assignmentContract
      });
      var booking = withoutUndefined(legacyBookingPayload(state, bookingSnap));
      var btn = document.getElementById('btnConfirm');
      state._bookingSubmitInFlight = true;
      if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึกการจอง...'; }
      db.ref('bookings/' + booking.code).set(booking).then(function() {
        console.log('[Booking1PreviewAdapter] booking saved:', booking.code);
        if (typeof global.showTicketPage === 'function') global.showTicketPage(booking);
      }).catch(function(err) {
        console.error('[Booking1PreviewAdapter] booking save failed', err);
        alert('บันทึกการจองไม่สำเร็จ กรุณาลองใหม่');
      }).then(function() {
        state._bookingSubmitInFlight = false;
        if (btn) { btn.disabled = false; btn.textContent = 'ยืนยันการชำระเงิน ›'; }
      });
    };

    global.SLBooking1PreviewAdapter = {
      patched: true,
      renderLoadedTrips: renderLoadedTrips,
      initializeRouteAndTrips: initializeRouteAndTrips
    };
    if (global.SLBookingBridge && typeof global.SLBookingBridge.onReady === 'function') {
      global.SLBookingBridge.onReady(initializeRouteAndTrips);
    } else {
      initializeRouteAndTrips();
    }
  }

  ready(function() {
    setTimeout(patch, 0);
  });
})(window);
