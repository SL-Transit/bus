(function(global) {
  'use strict';

  var geo = global.SLTransitGeo;
  if (!geo && typeof require === 'function') {
    try { geo = require('./geo-engine.js'); } catch (err) { geo = null; }
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function bookingCreatedAlerts(input) {
    input = input || {};
    var booking = input.booking || {};
    var recipients = [];
    addRecipient(recipients, 'passenger', booking.passengerLineId || booking.lineUserId);
    addRecipient(recipients, 'driver', booking.driverLineId || input.driverLineId);
    addRecipient(recipients, 'admin', input.adminLineId);
    if (booking.transferTerminalLineId || input.transferTerminalLineId) {
      addRecipient(recipients, 'transfer_terminal', booking.transferTerminalLineId || input.transferTerminalLineId);
    }
    return recipients.map(function(recipient) {
      return {
        event: 'booking_created',
        bookingCode: clean(booking.code),
        recipientRole: recipient.role,
        lineTo: recipient.lineTo,
        onceKey: ['booking_created', clean(booking.code), recipient.role, recipient.lineTo].join(':')
      };
    });
  }

  function transferArrivalAlert(input) {
    input = input || {};
    var booking = input.booking || {};
    var radiusKm = Number(input.radiusKm);
    if (!isFinite(radiusKm) || radiusKm <= 0) radiusKm = 2.5;
    var distanceKm = Number(input.distanceKm);
    if (!isFinite(distanceKm) && geo && input.vehiclePoint && input.transferPoint) {
      distanceKm = geo.distanceKm(input.vehiclePoint.lat, input.vehiclePoint.lng, input.transferPoint.lat, input.transferPoint.lng);
    }
    if (!isFinite(distanceKm) || distanceKm > radiusKm) return null;
    var terminalLineId = clean(input.terminalLineId || booking.transferTerminalLineId);
    if (!terminalLineId) return null;
    return {
      event: 'transfer_arrival_near',
      bookingCode: clean(booking.code),
      recipientRole: 'transfer_terminal',
      lineTo: terminalLineId,
      etaMinutes: input.etaMinutes == null ? null : Math.max(0, Math.round(Number(input.etaMinutes) || 0)),
      distanceKm: distanceKm,
      radiusKm: radiusKm,
      onceKey: ['transfer_arrival_near', clean(booking.code), terminalLineId].join(':')
    };
  }

  function shouldSendOnce(alert, sentKeys) {
    if (!alert || !alert.onceKey) return false;
    sentKeys = sentKeys || {};
    if (sentKeys[alert.onceKey] === true) return false;
    if (clean(sentKeys.alertCenterOnceKey) === alert.onceKey) return false;
    if (sentKeys.alertCenterSentKeys && sentKeys.alertCenterSentKeys[alert.onceKey] === true) return false;
    if (sentKeys.linePayload && clean(sentKeys.linePayload.alertCenterOnceKey) === alert.onceKey) return false;
    return true;
  }

  function addRecipient(recipients, role, lineTo) {
    lineTo = clean(lineTo);
    if (!lineTo) return;
    recipients.push({ role: role, lineTo: lineTo });
  }

  global.SLTransitAlertCenter = {
    bookingCreatedAlerts: bookingCreatedAlerts,
    transferArrivalAlert: transferArrivalAlert,
    shouldSendOnce: shouldSendOnce
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.SLTransitAlertCenter;
})(typeof window !== 'undefined' ? window : globalThis);
