(function(global) {
  'use strict';

  var DEFAULT_REASON_TH = {
    available: 'เปิดจอง',
    preview_not_apply_ready: 'ข้อมูลยังเป็นรอบตรวจสอบ ยังไม่เปิดจองจริง',
    booking_closed: 'ปิดรับจองชั่วคราว',
    reference_only: 'ข้อมูลอ้างอิง ไม่เปิดจอง',
    external_reference: 'บริการอ้างอิงภายนอก ไม่เก็บค่าโดยสารผ่าน SL-Transit',
    wang_nam_yen_disabled: 'วังน้ำเย็นยังไม่เปิดจอง',
    disabled_time: 'รอบเวลานี้ยังไม่เปิดจอง',
    closed_stop: 'ป้ายนี้ปิดรับจองสำหรับรอบเวลานี้',
    cutoff_closed: 'เลยเวลารับจองแล้ว',
    departure_past: 'รอบเวลาออกไปแล้ว',
    capacity_full: 'ที่นั่งเต็มแล้ว',
    missing_contract: 'ข้อมูลสัญญาการจองไม่ครบ'
  };

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function timeText(entry) {
    return clean(entry && (entry.time || entry.departTime || entry.departureTime)).slice(0, 5);
  }

  function isWangNamYen(value) {
    return /wang\s*_?nam\s*_?yen|wangnamyen/i.test(clean(value)) || clean(value) === 'วังน้ำเย็น';
  }

  function isExternalReference(pair, segment, timeEntry, option) {
    return pair.externalReference === true ||
      segment.externalReference === true ||
      timeEntry.externalReference === true ||
      option.externalReference === true ||
      pair.passengerDisplayMode === 'external_reference' ||
      segment.passengerDisplayMode === 'external_reference' ||
      timeEntry.passengerDisplayMode === 'external_reference' ||
      option.passengerDisplayMode === 'external_reference' ||
      pair.previewDisplayMode === 'external_reference' ||
      segment.previewDisplayMode === 'external_reference' ||
      timeEntry.previewDisplayMode === 'external_reference' ||
      option.previewDisplayMode === 'external_reference' ||
      pair.slTransitFareCollection === false ||
      segment.slTransitFareCollection === false ||
      timeEntry.slTransitFareCollection === false ||
      option.slTransitFareCollection === false ||
      pair.paymentOwnership === 'external_pay' ||
      segment.paymentOwnership === 'external_pay' ||
      timeEntry.paymentOwnership === 'external_pay' ||
      option.paymentOwnership === 'external_pay';
  }

  function isReferenceOnly(pair, segment, timeEntry, option) {
    return pair.referenceOnly === true ||
      segment.referenceOnly === true ||
      timeEntry.referenceOnly === true ||
      option.referenceOnly === true ||
      pair.previewDisplayMode === 'transfer_reference' ||
      segment.previewDisplayMode === 'transfer_reference' ||
      timeEntry.previewDisplayMode === 'transfer_reference' ||
      option.previewDisplayMode === 'transfer_reference' ||
      pair.routeChoiceStatus === 'reference_only' ||
      segment.routeChoiceStatus === 'reference_only' ||
      timeEntry.routeChoiceStatus === 'reference_only' ||
      option.routeChoiceStatus === 'reference_only' ||
      pair.transferStatus === 'feasible_reference';
  }

  function serviceDateTimeMs(serviceDate, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(serviceDate))) return null;
    if (!/^\d{1,2}:\d{2}$/.test(clean(time))) return null;
    var parsed = new Date(clean(serviceDate) + 'T' + clean(time).slice(0, 5) + ':00');
    var ms = parsed.getTime();
    return isFinite(ms) ? ms : null;
  }

  function isClosedStop(closedStopsByTime, time, destinationId) {
    var closed = closedStopsByTime && closedStopsByTime[time];
    if (!Array.isArray(closed)) return false;
    return closed.indexOf('__route__') !== -1 || closed.indexOf('*') !== -1 || closed.indexOf(destinationId) !== -1;
  }

  function decision(status, bookingEligible, reasonCode, extras) {
    var extra = extras || {};
    return Object.assign({
      status: status,
      bookingEligible: bookingEligible === true,
      selectionAllowed: extra.selectionAllowed === true || bookingEligible === true,
      reasonCode: reasonCode,
      displayReasonTh: DEFAULT_REASON_TH[reasonCode] || DEFAULT_REASON_TH.missing_contract,
      seatsAvailable: null,
      source: 'erp_logic_center'
    }, extra);
  }

  function decideBookingAvailability(input) {
    input = input || {};
    var pair = input.pair || {};
    var segment = input.segment || {};
    var timeEntry = input.timeEntry || {};
    var option = input.option || {};
    var preview = input.preview || {};
    var capacity = input.capacity || {};
    var time = timeText(timeEntry) || clean(input.time).slice(0, 5);
    var destinationId = clean(input.destinationId || option.destinationId || pair.destinationId || segment.destinationId);
    var originId = clean(input.originId || option.originDestinationId || pair.originDestinationId || segment.originDestinationId);
    var requestedSeats = Math.max(1, num(input.requestedSeats, 1));
    var bookedSeats = Math.max(0, num(capacity.bookedSeats == null ? input.bookedSeats : capacity.bookedSeats, 0));
    var limit = num(capacity.capacity == null ? input.capacity : capacity.capacity, 0);
    var seatsAvailable = limit > 0 ? Math.max(0, limit - bookedSeats) : null;
    var departureMs = serviceDateTimeMs(input.serviceDate, time);
    var now = num(input.now, Date.now());
    var cutoffMinutes = num(input.cutoffMinutes, 60);
    var disabledTimes = Array.isArray(input.disabledTimes) ? input.disabledTimes : [];
    var bookingOpen = input.bookingOpen !== false;

    if (!time || !pair || !option) return decision('unavailable', false, 'missing_contract');
    if (isExternalReference(pair, segment, timeEntry, option)) return decision('external_reference', false, 'external_reference', { seatsAvailable: seatsAvailable });
    if (isReferenceOnly(pair, segment, timeEntry, option)) return decision('reference_only', false, 'reference_only', { seatsAvailable: seatsAvailable, selectionAllowed: true });
    if (isWangNamYen(destinationId) || isWangNamYen(originId) || isWangNamYen(pair.destinationLabel) || isWangNamYen(pair.originLabel)) {
      return decision('unavailable', false, 'wang_nam_yen_disabled', { seatsAvailable: seatsAvailable });
    }
    if (pair.bookingEligible === false || timeEntry.bookingEligible === false || option.bookingEligible === false || !bookingOpen) {
      return decision('unavailable', false, 'booking_closed', { seatsAvailable: seatsAvailable });
    }
    if (disabledTimes.indexOf(time) !== -1) return decision('unavailable', false, 'disabled_time', { seatsAvailable: seatsAvailable });
    if (isClosedStop(input.closedStopsByTime, time, destinationId)) return decision('unavailable', false, 'closed_stop', { seatsAvailable: seatsAvailable });
    if (departureMs !== null && departureMs <= now) return decision('unavailable', false, 'departure_past', { seatsAvailable: seatsAvailable });
    if (departureMs !== null && (departureMs - now) / 60000 <= cutoffMinutes) return decision('unavailable', false, 'cutoff_closed', { seatsAvailable: seatsAvailable });
    if (limit > 0 && bookedSeats + requestedSeats > limit) return decision('unavailable', false, 'capacity_full', { seatsAvailable: seatsAvailable });
    if (preview.readyForApply !== true || preview.productionReady !== true || preview.writesEnabled !== true) {
      return decision('unavailable', false, 'preview_not_apply_ready', { seatsAvailable: seatsAvailable, selectionAllowed: true });
    }
    return decision('available', true, 'available', { seatsAvailable: seatsAvailable });
  }

  global.SLTransitBookingAvailabilityCenter = {
    decideBookingAvailability: decideBookingAvailability,
    isExternalReference: isExternalReference,
    isReferenceOnly: isReferenceOnly
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitBookingAvailabilityCenter;
})(typeof window !== 'undefined' ? window : globalThis);
