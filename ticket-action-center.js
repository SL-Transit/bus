(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SLTransitTicketActionCenter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var CONTRACT_VERSION = 'ticket_action_center_cancel_v1';
  var DEFAULT_MIN_CANCEL_MINUTES = 60;

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function isCancelled(booking) {
    return !!(booking && booking.status === 'cancelled');
  }

  function departureDate(booking) {
    if (!booking || !booking.date || !booking.time) return null;
    var time = String(booking.time).slice(0, 5);
    var d = new Date(booking.date + 'T' + time + ':00');
    return isNaN(d.getTime()) ? null : d;
  }

  function evaluateCancellation(booking, options) {
    options = options || {};
    var minMinutes = Number(options.minMinutesBeforeDeparture || DEFAULT_MIN_CANCEL_MINUTES);
    var nowMs = Number(options.nowMs || Date.now());

    if (!booking) {
      return {
        contractVersion: CONTRACT_VERSION,
        source: 'ticket-action-center',
        allowed: false,
        reason: 'missing_booking',
        notice: 'ยังไม่พบข้อมูลการจอง'
      };
    }

    if (isCancelled(booking)) {
      return {
        contractVersion: CONTRACT_VERSION,
        source: 'ticket-action-center',
        allowed: false,
        reason: 'already_cancelled',
        notice: 'ตั๋วนี้ถูกยกเลิกแล้ว'
      };
    }

    var dep = departureDate(booking);
    if (!dep) {
      return {
        contractVersion: CONTRACT_VERSION,
        source: 'ticket-action-center',
        allowed: false,
        reason: 'missing_departure_time',
        notice: 'ตั๋วนี้ยกเลิกไม่ได้ เพราะข้อมูลวันหรือเวลาเดินทางไม่ครบ'
      };
    }

    if (dep.getTime() - nowMs < minMinutes * 60000) {
      return {
        contractVersion: CONTRACT_VERSION,
        source: 'ticket-action-center',
        allowed: false,
        reason: 'too_close_to_departure',
        notice: 'ตั๋วนี้ยกเลิกไม่ได้แล้ว เพราะเหลือเวลาก่อนรถออกน้อยกว่า ' + minMinutes + ' นาที'
      };
    }

    return {
      contractVersion: CONTRACT_VERSION,
      source: 'ticket-action-center',
      allowed: true,
      reason: 'eligible',
      notice: 'ยังสามารถยกเลิกได้ กรุณาตรวจสอบข้อมูลการจองก่อนกดยกเลิก'
    };
  }

  function bookingPathFromTicket(ticket) {
    ticket = ticket || {};
    var readPath = clean(ticket.readPath);
    if (readPath) return readPath;
    var code = clean(ticket.code || (ticket.booking && ticket.booking.code)).toUpperCase();
    if (!code) return '';
    return (/^TB\d{6}$/i.test(code) || (ticket.booking && ticket.booking.testMode)) ? 'testBookings/' + code : 'bookings/' + code;
  }

  function cancellationPatch(serverTimestamp) {
    return {
      status: 'cancelled',
      cancelledAt: serverTimestamp || Date.now(),
      officialStatus: 'ตั๋วของคุณถูกยกเลิกแล้ว',
      ticketActionContract: CONTRACT_VERSION
    };
  }

  function cancelTicket(params) {
    params = params || {};
    var db = params.db;
    var ticket = params.ticket || {};
    var booking = ticket.booking || params.booking;
    var evaluation = evaluateCancellation(booking, params.policy || params);
    if (!evaluation.allowed) {
      var blocked = new Error('TICKET_CANCELLATION_BLOCKED:' + evaluation.reason);
      blocked.evaluation = evaluation;
      return Promise.reject(blocked);
    }
    if (!db || typeof db.ref !== 'function') {
      return Promise.reject(new Error('TICKET_ACTION_CENTER_DB_REQUIRED'));
    }
    var path = bookingPathFromTicket(ticket);
    if (!path) {
      return Promise.reject(new Error('TICKET_ACTION_CENTER_PATH_REQUIRED'));
    }
    var firebaseNamespace = params.firebase;
    var serverTimestamp = firebaseNamespace &&
      firebaseNamespace.database &&
      firebaseNamespace.database.ServerValue &&
      firebaseNamespace.database.ServerValue.TIMESTAMP;
    var patch = cancellationPatch(serverTimestamp);
    return db.ref(path).update(patch).then(function() {
      return {
        contractVersion: CONTRACT_VERSION,
        source: 'ticket-action-center',
        action: 'cancel_ticket',
        allowed: true,
        bookingPath: path,
        patch: patch,
        booking: Object.assign({}, booking || {}, patch)
      };
    });
  }

  return {
    contractVersion: CONTRACT_VERSION,
    defaultMinCancelMinutes: DEFAULT_MIN_CANCEL_MINUTES,
    departureDate: departureDate,
    evaluateCancellation: evaluateCancellation,
    bookingPathFromTicket: bookingPathFromTicket,
    cancellationPatch: cancellationPatch,
    cancelTicket: cancelTicket
  };
});
