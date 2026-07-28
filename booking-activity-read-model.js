(function (global) {
  'use strict';

  var ENDPOINT = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/readBookingActivity';
  var TIMEZONE = 'Asia/Bangkok';
  var RANGE_SIZES = { hourly: 24, daily: 30, weekly: 12, monthly: 12, yearly: 5 };
  var PRIVATE_FIELDS = ['name', 'phone', 'bookingCode', 'ticketCode', 'paymentEvidence', 'passengerId', 'rawBooking'];
  var CACHE = {};
  var REQUEST_SEQ = {};

  function notify() {
    try { global.dispatchEvent(new CustomEvent('sltransit:booking-activity-updated')); } catch (e) { /* no-op */ }
  }

  function todayBangkok() {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    var out = {};
    parts.forEach(function (part) { out[part.type] = part.value; });
    return out.year + '-' + out.month + '-' + out.day;
  }

  function cacheKey(params) {
    return (params.range || 'daily') + ':' + (params.anchor || params.serviceDate || todayBangkok());
  }

  function cleanTotals(input) {
    var totals = input || {};
    return {
      bookings: Math.max(0, Math.round(Number(totals.bookings) || 0)),
      cancellations: Math.max(0, Math.round(Number(totals.cancellations) || 0)),
      refunds: Math.max(0, Math.round(Number(totals.refunds) || 0))
    };
  }

  function validatePoint(point) {
    if (!point || typeof point !== 'object') throw new Error('invalid point');
    PRIVATE_FIELDS.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(point, field)) throw new Error('private field in booking activity response');
    });
    return {
      key: String(point.key || ''),
      label: String(point.label || point.key || ''),
      bookings: Math.max(0, Math.round(Number(point.bookings) || 0)),
      cancellations: Math.max(0, Math.round(Number(point.cancellations) || 0)),
      refunds: Math.max(0, Math.round(Number(point.refunds) || 0))
    };
  }

  function validateResponse(range, response) {
    if (!response || typeof response !== 'object') throw new Error('invalid response');
    PRIVATE_FIELDS.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(response, field)) throw new Error('private field in booking activity response');
    });
    if (response.range !== range) throw new Error('range mismatch');
    if (response.timezone !== TIMEZONE) throw new Error('timezone mismatch');
    if (response.status !== 'ready' && response.status !== 'empty') throw new Error('invalid status');
    if (!Array.isArray(response.points) || response.points.length !== RANGE_SIZES[range]) throw new Error('bucket count mismatch');
    return {
      status: response.status,
      range: range,
      timezone: TIMEZONE,
      points: response.points.map(validatePoint),
      totals: cleanTotals(response.totals),
      generatedAt: Number(response.generatedAt) || Date.now()
    };
  }

  function loading(range) {
    return { status: 'loading', range: range || 'daily', points: [], totals: null };
  }

  function unavailable(range, error) {
    return { status: 'error', range: range || 'daily', points: [], totals: null, error: error || 'unavailable' };
  }

  function fetchSnapshot(params, force) {
    params = params || {};
    var range = params.range || 'daily';
    var anchor = params.anchor || params.serviceDate || todayBangkok();
    if (!Object.prototype.hasOwnProperty.call(RANGE_SIZES, range)) return Promise.resolve(unavailable(range, 'invalid_range'));
    var key = cacheKey({ range: range, anchor: anchor });
    if (!force && CACHE[key] && CACHE[key].status !== 'loading') return Promise.resolve(CACHE[key]);
    var seq = (REQUEST_SEQ[key] || 0) + 1;
    REQUEST_SEQ[key] = seq;
    CACHE[key] = loading(range);
    if (typeof fetch !== 'function') {
      CACHE[key] = unavailable(range, 'fetch_unavailable');
      return Promise.resolve(CACHE[key]);
    }
    return fetch(ENDPOINT + '?range=' + encodeURIComponent(range) + '&anchor=' + encodeURIComponent(anchor), {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('readBookingActivity HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      if (REQUEST_SEQ[key] !== seq) return CACHE[key];
      CACHE[key] = validateResponse(range, json);
      notify();
      return CACHE[key];
    }).catch(function (err) {
      if (REQUEST_SEQ[key] !== seq) return CACHE[key];
      CACHE[key] = unavailable(range, err && err.message ? err.message : String(err));
      notify();
      return CACHE[key];
    });
  }

  function getSnapshot(params) {
    params = params || {};
    var range = params.range || 'daily';
    var anchor = params.anchor || params.serviceDate || todayBangkok();
    var key = cacheKey({ range: range, anchor: anchor });
    if (!CACHE[key]) {
      fetchSnapshot({ range: range, anchor: anchor }, false);
      return loading(range);
    }
    return CACHE[key];
  }

  var api = {
    getSnapshot: getSnapshot,
    refresh: function (params) { return fetchSnapshot(params || {}, true); },
    validateResponse: validateResponse,
    _setCacheForTest: function (params, value) { CACHE[cacheKey(params || {})] = value; },
    _clearCacheForTest: function () { CACHE = {}; }
  };

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.bookingActivityReadModel = api;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
