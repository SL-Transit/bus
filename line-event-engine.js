(function(global) {
  'use strict';

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function bookingPayload(booking) {
    booking = booking || {};
    return {
      event: 'booking_created',
      source: 'booking.html',
      booking_id: booking.code || '',
      passenger_name: booking.name || '',
      route: booking.route || '',
      round_time: booking.time || '',
      date: booking.date || '',
      seats: booking.seats || 1,
      price: booking.price || 0,
      original_payload: booking
    };
  }

  function mockLogPayload(linePayload, updatePayload, eventName, context) {
    context = context || {};
    linePayload = linePayload || {};
    return {
      booking_id: clean(linePayload.booking_id || linePayload.code || context.code),
      passenger_name: clean(linePayload.passenger_name || linePayload.name || context.name),
      route: clean(linePayload.route || context.route),
      round_time: clean(linePayload.round_time || linePayload.time || context.time),
      test_mode: true,
      line_mock_status: 'success',
      event: eventName || linePayload.event || '',
      original_payload: linePayload,
      update_payload: updatePayload || {}
    };
  }

  function notificationTrigger(linePayload, updatePayload, eventName, context) {
    context = context || {};
    linePayload = linePayload || {};
    updatePayload = updatePayload || {};
    var now = Date.now();
    var triggerCode = context.code || ('CI' + now.toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase());
    var booking = context.booking || {};
    return {
      code: triggerCode,
      originalCode: booking.code || context.originalCode || '',
      notificationOnly: true,
      notificationType: eventName || linePayload.event || '',
      source: context.source || 'check_ticket.html',
      lineEvent: eventName || linePayload.event || '',
      lineMessage: linePayload.message || '',
      linePayload: linePayload,
      groupId: context.groupId || linePayload.groupId || '',
      to: context.groupId || linePayload.to || '',
      lineTo: context.groupId || linePayload.lineTo || '',
      destinationId: context.groupId || linePayload.destinationId || '',
      lineMessagingMode: linePayload.notifyMode || '',
      lineMessagingBatchKey: linePayload.batchKey || '',
      lineMessagingBatchWindowMs: linePayload.batchWindowMs || '',
      lineMessagingStatus: context.testMode ? 'mock_skipped' : 'pending',
      lineMessagingAttemptId: linePayload.lineMessagingAttemptId || '',
      testMode: context.testMode === true,
      mockOnly: context.testMode === true,
      name: booking.name || '',
      phone: booking.phone || '',
      route: booking.route || '',
      origin: booking.origin || '',
      destination: booking.destination || '',
      date: booking.date || '',
      time: booking.time || '',
      leg1Route: linePayload.leg1Route || '',
      leg1Time: linePayload.leg1Time || '',
      leg2Route: linePayload.leg2Route || '',
      leg2Time: linePayload.leg2Time || '',
      legSchedule: linePayload.legSchedule || {},
      seats: booking.seats || 1,
      price: booking.price || '',
      status: updatePayload.status || booking.status || 'checked_in',
      checkedInAt: updatePayload.checkedInAt || now,
      officialStatus: updatePayload.officialStatus || '',
      checkin: updatePayload.checkin || {}
    };
  }

  global.SLTransitLineEvents = {
    bookingPayload: bookingPayload,
    mockLogPayload: mockLogPayload,
    notificationTrigger: notificationTrigger
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitLineEvents;
})(typeof window !== 'undefined' ? window : globalThis);
