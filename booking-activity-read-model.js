(function (global) {
  'use strict';

  // Read-only aggregator for real booking / cancellation / refund activity.
  //
  // Source of truth: the live `bookings/{code}` path that booking1.html actually
  // writes to today (see ai-handoffs/WORK-STATUS.md "Legacy booking entrypoint
  // cutover"). screen01-central-read-model.js documents `operations/bookings` as
  // the *proposed* canonical path pending Owner confirmation and explicitly
  // rejects the legacy top-level `bookings` path as an *automatic silent
  // fallback* for other Dashboard modules. This module is a deliberate,
  // Owner-approved exception scoped only to visitor/booking stat reporting: it
  // reads the real path that already has real data, so the dashboard shows real
  // numbers now. If/when `operations/bookings` becomes the confirmed write path,
  // re-point ANALYTICS_BOOKINGS_PATH below.
  //
  // Firebase rules: `bookings` has `.read: true` (public read) and is indexed on
  // `date`, so this is a plain read — no rules/index changes needed. Only a
  // minimal aggregate subset of each record (date/status/pax) is kept in memory;
  // passenger name/phone are never read into the cache.

  var BOOKINGS_PATH = 'bookings';
  var LOAD_WINDOW_DAYS = 400;
  var REFRESH_MS = 5 * 60 * 1000;

  var CACHE = { byId: {}, status: 'loading', error: null, loadedAt: 0 };

  function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }
  function weekKeyFromDate(d) { return d.getFullYear() + '-W' + Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1) / 7); }
  function monthKeyFromDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function yearKeyFromDate(d) { return String(d.getFullYear()); }

  function bucketKeyFor(range, dayKey) {
    var d = new Date(dayKey + 'T00:00:00+07:00');
    if (isNaN(d.getTime())) return null;
    if (range === 'weekly') return weekKeyFromDate(d);
    if (range === 'monthly') return monthKeyFromDate(d);
    if (range === 'yearly') return yearKeyFromDate(d);
    return dayKey;
  }

  function isCancelled(rec) { return rec.status === 'cancelled'; }
  function isRefunded(rec) { return rec.paymentStatus === 'refunded' || rec.refundStatus === 'refunded'; }

  function aggregate(range) {
    var out = {};
    Object.keys(CACHE.byId).forEach(function (id) {
      var rec = CACHE.byId[id] || {};
      var dayKey = String(rec.date || '').slice(0, 10);
      var key = bucketKeyFor(range, dayKey);
      if (!key) return;
      if (!out[key]) out[key] = { bookings: 0, cancellations: 0, refunds: 0 };
      out[key].bookings += 1;
      if (isCancelled(rec)) out[key].cancellations += 1;
      if (isRefunded(rec)) out[key].refunds += 1;
    });
    return Object.keys(out).map(function (key) { return Object.assign({ key: key }, out[key]); });
  }

  function totals() {
    var ids = Object.keys(CACHE.byId);
    var cancelledCount = 0, refundedCount = 0, passengerCount = 0;
    ids.forEach(function (id) {
      var rec = CACHE.byId[id] || {};
      if (isCancelled(rec)) cancelledCount += 1;
      if (isRefunded(rec)) refundedCount += 1;
      passengerCount += Number(rec.pax || 0) || 0;
    });
    return { bookingCount: ids.length, cancelledCount: cancelledCount, refundedCount: refundedCount, passengerCount: passengerCount };
  }

  // Real-users source (booking half): a completed booking write to
  // `bookings/{code}` means someone finished the booking flow that day. The
  // page-visit half (passenger.html / check_ticket.html) comes from
  // site-analytics-read-model.js, since a booking record has no device id to
  // correlate with page-view analytics.
  function daySummary(dayKey) {
    var bookingCount = 0, revenue = 0;
    Object.keys(CACHE.byId).forEach(function (id) {
      var rec = CACHE.byId[id] || {};
      if (String(rec.date || '').slice(0, 10) !== dayKey) return;
      bookingCount += 1;
      if (!isCancelled(rec)) revenue += Number(rec.price || 0) || 0;
    });
    return { bookingCount: bookingCount, revenue: revenue, hasData: CACHE.status === 'ready' };
  }

  function snapshot(params) {
    params = params || {};
    var range = params.range || 'daily';
    if (range === 'hourly') {
      return Object.assign({ status: 'unavailable', range: range, points: [], reason: 'hourly booking breakdown not aggregated' }, totals());
    }
    if (CACHE.status === 'error') return Object.assign({ status: 'error', range: range, points: [], error: CACHE.error }, totals());
    if (CACHE.status === 'loading' && !CACHE.loadedAt) return { status: 'loading', range: range, points: [] };
    return Object.assign({ status: 'ready', range: range, points: aggregate(range) }, totals());
  }

  function notify() {
    try { global.dispatchEvent(new CustomEvent('sltransit:booking-activity-updated')); } catch (e) { /* no-op outside browser */ }
  }

  var isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  function cutoffDayKey() {
    var d = new Date(Date.now() - LOAD_WINDOW_DAYS * 86400000);
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d), p = {};
    parts.forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }

  function start() {
    if (!global.firebase || !global.firebase.apps || !global.firebase.apps.length || !global.firebase.database) { setTimeout(start, 300); return; }
    function load() {
      global.firebase.database().ref(BOOKINGS_PATH).orderByChild('date').startAt(cutoffDayKey()).once('value').then(function (snap) {
        var val = snap.val() || {};
        var byId = {};
        Object.keys(val).forEach(function (id) {
          var rec = val[id] || {};
          byId[id] = {
            date: rec.date || rec.serviceDate || '',
            status: rec.status || rec.bookingStatus || '',
            paymentStatus: rec.paymentStatus || '',
            refundStatus: rec.refundStatus || '',
            pax: Number(rec.pax || rec.seats || 0) || 0,
            price: Number(rec.price || 0) || 0
          };
        });
        CACHE.byId = byId;
        CACHE.status = 'ready';
        CACHE.error = null;
        CACHE.loadedAt = Date.now();
        notify();
      }).catch(function (err) {
        CACHE.status = 'error';
        CACHE.error = (err && err.message) || String(err);
        notify();
      });
    }
    load();
    setInterval(load, REFRESH_MS);
  }
  if (isBrowser) start();

  var api = { getSnapshot: snapshot, getDaySummary: daySummary };
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.bookingActivityReadModel = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      aggregate: aggregate,
      snapshot: snapshot,
      totals: totals,
      daySummary: daySummary,
      weekKeyFromDate: weekKeyFromDate,
      monthKeyFromDate: monthKeyFromDate,
      yearKeyFromDate: yearKeyFromDate,
      _setCacheForTest: function (byId, status) {
        CACHE.byId = byId || {};
        CACHE.status = status || 'ready';
        CACHE.loadedAt = Date.now();
      }
    };
  }
})(typeof window !== 'undefined' ? window : global);
