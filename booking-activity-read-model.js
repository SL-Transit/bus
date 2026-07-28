(function (global) {
  'use strict';

  var ENDPOINT = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/readBookingActivity';
  var REFRESH_MS = 5 * 60 * 1000;
  var CACHE = {};

  function cacheKey(range, serviceDate) {
    return (range || 'daily') + '|' + (serviceDate || '');
  }

  function empty(range) {
    return { status: 'empty', range: range || 'daily', points: [] };
  }

  function validatePoint(point) {
    return point && typeof point === 'object' &&
      typeof point.key === 'string' &&
      typeof point.label === 'string' &&
      Number.isInteger(point.bookings) && point.bookings >= 0 &&
      Number.isInteger(point.cancellations) && point.cancellations >= 0 &&
      Number.isInteger(point.refunds) && point.refunds >= 0 &&
      point.name == null &&
      point.phone == null &&
      point.rawBooking == null &&
      point.bookingCode == null &&
      point.ticketCode == null &&
      point.path == null;
  }

  function validatePayload(payload, range) {
    if (!payload || typeof payload !== 'object') throw new Error('invalid booking activity response');
    if (payload.range !== range) throw new Error('booking activity range mismatch');
    if (payload.status !== 'ready' && payload.status !== 'empty') throw new Error('invalid booking activity status');
    if (!Array.isArray(payload.points)) throw new Error('invalid booking activity points');
    if (!payload.points.every(validatePoint)) throw new Error('private booking field in response');
    return payload;
  }

  function fetchSnapshot(params) {
    params = params || {};
    var range = params.range || 'daily';
    var serviceDate = params.serviceDate || '';
    var url = ENDPOINT + '?range=' + encodeURIComponent(range) + (serviceDate ? '&anchor=' + encodeURIComponent(serviceDate) : '');
    return fetch(url, { method: 'GET', credentials: 'omit', cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('readBookingActivity HTTP ' + res.status);
      return res.json();
    }).then(function (payload) {
      var model = validatePayload(payload, range);
      model.loadedAt = Date.now();
      CACHE[cacheKey(range, serviceDate)] = model;
      return model;
    }).catch(function (err) {
      var model = { status: 'error', range: range, points: [], error: err.message || String(err) };
      CACHE[cacheKey(range, serviceDate)] = model;
      return model;
    });
  }

  function getSnapshot(params) {
    params = params || {};
    var range = params.range || 'daily';
    var serviceDate = params.serviceDate || '';
    var key = cacheKey(range, serviceDate);
    if (!CACHE[key]) {
      CACHE[key] = { status: 'loading', range: range, points: [] };
      if (typeof fetch === 'function') fetchSnapshot(params).then(notify);
      else CACHE[key] = { status: 'unavailable', range: range, points: [] };
    } else if (CACHE[key].loadedAt && Date.now() - CACHE[key].loadedAt > REFRESH_MS && typeof fetch === 'function') {
      fetchSnapshot(params).then(notify);
    }
    return CACHE[key] || empty(range);
  }

  function notify() {
    try { global.dispatchEvent(new CustomEvent('sltransit:booking-activity-updated')); } catch (e) {}
  }

  var api = { getSnapshot: getSnapshot, fetchSnapshot: fetchSnapshot };
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.bookingActivityReadModel = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      getSnapshot: getSnapshot,
      fetchSnapshot: fetchSnapshot,
      validatePayload: validatePayload,
      _setCacheForTest: function (key, value) { CACHE[key] = value; }
    };
  }
})(typeof window !== 'undefined' ? window : global);
