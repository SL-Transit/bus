(function (global) {
  'use strict';

  // Read-only aggregator for real website visitor stats.
  //
  // Source of truth: analytics/mainWeb/{YYYY-MM-DD} written by site-analytics.js
  // (unique-device count per day + pageViews per day). This module does not write
  // anything to Firebase; it only reads and re-buckets that data for the Admin ERP
  // dashboard chart at admin-erp.html#website-analytics, which already calls
  // globalThis.SLTransit.siteAnalyticsReadModel.getSnapshot({range, serviceDate}).
  //
  // Honesty rule: analytics/mainWeb only stores one aggregate row per day (no
  // per-hour breakdown), so the "hourly" range is reported as unavailable instead
  // of being estimated/faked.

  var ANALYTICS_PATH = 'analytics/mainWeb';
  var LOAD_WINDOW_DAYS = 400; // covers weekly(12wk)/monthly(12mo) fully; yearly shows real partial data only
  var REFRESH_MS = 5 * 60 * 1000;

  var CACHE = { byDay: {}, status: 'loading', error: null, loadedAt: 0 };

  function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }

  function weekKeyFromDate(d) {
    return d.getFullYear() + '-W' + Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
  }
  function monthKeyFromDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function yearKeyFromDate(d) { return String(d.getFullYear()); }

  function bucketKeyFor(range, dayKey) {
    var d = new Date(dayKey + 'T00:00:00+07:00');
    if (isNaN(d.getTime())) return null;
    if (range === 'weekly') return weekKeyFromDate(d);
    if (range === 'monthly') return monthKeyFromDate(d);
    if (range === 'yearly') return yearKeyFromDate(d);
    return dayKey; // daily default; matches admin-erp.html bucketLabels() ISO date keys
  }

  function aggregate(range) {
    var out = {};
    Object.keys(CACHE.byDay).forEach(function (dayKey) {
      var rec = CACHE.byDay[dayKey] || {};
      var key = bucketKeyFor(range, dayKey);
      if (!key) return;
      if (!out[key]) out[key] = { visits: 0, estimatedVisitors: 0 };
      out[key].visits += Number(rec.pageViews || 0);
      // Summed daily unique-device counts across a bucket is an estimate (a device
      // visiting on two different days counts twice), which is why the dashboard
      // label already says "ผู้เยี่ยมชมโดยประมาณ" (estimated visitors).
      out[key].estimatedVisitors += Number(rec.count || 0);
    });
    return Object.keys(out).map(function (key) {
      return { key: key, visits: out[key].visits, estimatedVisitors: out[key].estimatedVisitors };
    });
  }

  // Real-users source (page-based half only): unique devices that reached a
  // "real intent" page today (passenger.html or check_ticket.html login/lookup
  // screens). The other half — successful bookings — comes from
  // booking-activity-read-model.js, since a completed booking is a Firebase
  // write to `bookings/{code}`, not a page load site-analytics.js can see.
  var REAL_USER_PAGES = ['passenger_html', 'check_ticket_html'];

  function daySummary(dayKey) {
    var rec = CACHE.byDay[dayKey];
    if (!rec) return { visits: 0, estimatedVisitors: 0, realUserPageVisitors: 0, hasData: false };
    var pdc = rec.pageDeviceCounts || {};
    var realUserPageVisitors = REAL_USER_PAGES.reduce(function (sum, page) { return sum + Number(pdc[page] || 0); }, 0);
    return { visits: Number(rec.pageViews || 0), estimatedVisitors: Number(rec.count || 0), realUserPageVisitors: realUserPageVisitors, hasData: true };
  }

  function snapshot(params) {
    params = params || {};
    var range = params.range || 'daily';
    if (range === 'hourly') {
      return { status: 'unavailable', range: range, points: [], reason: 'analytics/mainWeb stores daily aggregates only; no hourly breakdown is collected' };
    }
    if (CACHE.status === 'error') return { status: 'error', range: range, points: [], error: CACHE.error };
    if (CACHE.status === 'loading' && !CACHE.loadedAt) return { status: 'loading', range: range, points: [] };
    return { status: 'ready', range: range, points: aggregate(range) };
  }

  function notify() {
    try { global.dispatchEvent(new CustomEvent('sltransit:analytics-updated')); } catch (e) { /* no-op outside browser */ }
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
      global.firebase.database().ref(ANALYTICS_PATH).orderByKey().startAt(cutoffDayKey()).once('value').then(function (snap) {
        var val = snap.val() || {};
        var byDay = {};
        Object.keys(val).forEach(function (dayKey) {
          var rec = val[dayKey] || {};
          byDay[dayKey] = { pageViews: Number(rec.pageViews || 0), count: Number(rec.count || 0), pageDeviceCounts: rec.pageDeviceCounts || {} };
        });
        CACHE.byDay = byDay;
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
  global.SLTransit.siteAnalyticsReadModel = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      aggregate: aggregate,
      snapshot: snapshot,
      daySummary: daySummary,
      weekKeyFromDate: weekKeyFromDate,
      monthKeyFromDate: monthKeyFromDate,
      yearKeyFromDate: yearKeyFromDate,
      _setCacheForTest: function (byDay, status) {
        CACHE.byDay = byDay || {};
        CACHE.status = status || 'ready';
        CACHE.loadedAt = Date.now();
      }
    };
  }
})(typeof window !== 'undefined' ? window : global);
