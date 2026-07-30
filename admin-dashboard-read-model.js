(function (global) {
  'use strict';

  var ENDPOINT = 'https://asia-southeast1-sl-transit-9464e.cloudfunctions.net/readAdminDashboardSummary';
  var TIMEZONE = 'Asia/Bangkok';
  var RANGE_SIZES = { hourly: 24, daily: 30, weekly: 12, monthly: 12, yearly: 5 };
  var PRIVATE_FIELDS = ['name', 'firstName', 'lastName', 'surname', 'phone', 'lineUserId', 'bookingCode', 'ticketCode', 'slip', 'paymentEvidence', 'passengerIdentity', 'rawBooking', 'bankAccount', 'password'];
  var CACHE = {};
  var requestSeq = 0;

  function todayBangkok() {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    var out = {};
    parts.forEach(function (part) { out[part.type] = part.value; });
    return out.year + '-' + out.month + '-' + out.day;
  }

  function cacheKey(params) {
    return (params.range || 'daily') + ':' + (params.anchor || params.serviceDate || todayBangkok());
  }

  function nonNegativeInt(value) {
    return Math.max(0, Math.round(Number(value) || 0));
  }

  function nullableNonNegativeInt(value) {
    if (value === null || value === undefined || value === '') return null;
    return nonNegativeInt(value);
  }

  function money(value) {
    var n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }

  function rejectPrivateFields(value) {
    var text = JSON.stringify(value || {});
    PRIVATE_FIELDS.forEach(function (field) {
      if (text.indexOf('"' + field + '"') >= 0) throw new Error('private field in dashboard response');
    });
  }

  function validatePoint(point, type) {
    if (!point || typeof point !== 'object') throw new Error('invalid point');
    rejectPrivateFields(point);
    if (type === 'website') {
      return {
        key: String(point.key || ''),
        label: String(point.label || point.key || ''),
        visitors: nullableNonNegativeInt(point.visitors),
        actualUsers: nullableNonNegativeInt(point.actualUsers)
      };
    }
    return {
      key: String(point.key || ''),
      label: String(point.label || point.key || ''),
      bookings: nonNegativeInt(point.bookings),
      cancellations: nonNegativeInt(point.cancellations),
      refunds: nonNegativeInt(point.refunds)
    };
  }

  function validateRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice(0, 200).map(function (row) {
      rejectPrivateFields(row);
      var clean = {
        vehicleId: row.vehicleId || row.id || '',
        vehicleAlias: row.vehicleAlias || row.carAlias || row.alias || row.vehicleDisplayName || '',
        driverId: row.driverId || row.driverName || '—',
        driverDisplayName: row.driverDisplayName || row.driverPublicName || row.publicDriverName || '',
        queueId: row.queueId || '',
        routeId: row.routeId || row.id || '',
        origin: row.origin || '',
        destination: row.destination || '',
        tripId: row.tripId || '',
        pickupTime: row.pickupTime || '',
        bookingCount: nonNegativeInt(row.bookingCount),
        passengerCount: nonNegativeInt(row.passengerCount),
        grossAmount: money(row.grossAmount),
        fareAmount: money(row.fareAmount),
        serviceFeeAmount: money(row.serviceFeeAmount),
        refundAmount: money(row.refundAmount),
        netAmount: money(row.netAmount),
        paymentMethod: row.paymentMethod || '',
        approvalStatus: row.approvalStatus || row.status || 'ready',
        signatureStatus: row.signatureStatus || '',
        status: row.status || 'ready'
      };
      clean['คิวหรือผู้ให้บริการ'] = clean.queueId || clean.routeId || 'ยังไม่ระบุ';
      clean['เส้นทางช่วงต่อ'] = [clean.origin, clean.destination].filter(Boolean).join(' - ') || clean.tripId || '—';
      clean['จำนวนรายการ'] = clean.bookingCount;
      clean['ค่าโดยสาร'] = clean.fareAmount == null ? '—' : clean.fareAmount.toLocaleString('th-TH');
      clean['ยอดปรับจากคืนเงิน'] = clean.refundAmount == null ? '—' : clean.refundAmount.toLocaleString('th-TH');
      clean['ยอดสุทธิ'] = clean.netAmount == null ? '—' : clean.netAmount.toLocaleString('th-TH');
      clean['จ่ายแล้ว'] = '—';
      clean['รอจ่าย'] = '—';
      clean['สถานะ'] = clean.status;
      return clean;
    });
  }

  function validateResponse(range, response) {
    if (!response || typeof response !== 'object') throw new Error('invalid response');
    rejectPrivateFields(response);
    if (response.timezone !== TIMEZONE) throw new Error('timezone mismatch');
    if (response.range !== range) throw new Error('range mismatch');
    if (response.status !== 'ready' && response.status !== 'empty') throw new Error('invalid status');
    if (!response.website || !Array.isArray(response.website.points) || response.website.points.length !== RANGE_SIZES[range]) throw new Error('website bucket count mismatch');
    if (!response.bookings || !Array.isArray(response.bookings.points) || response.bookings.points.length !== RANGE_SIZES[range]) throw new Error('booking bucket count mismatch');
    return {
      status: response.status,
      range: range,
      anchor: response.anchor || '',
      timezone: TIMEZONE,
      visits: {
        status: response.website.status || response.status,
        range: range,
        visitors: nullableNonNegativeInt(response.website.visitors),
        actualUsers: nullableNonNegativeInt(response.website.actualUsers),
        points: response.website.points.map(function (point) { return validatePoint(point, 'website'); })
      },
      bookings: {
        status: response.status,
        createdCount: nonNegativeInt(response.bookings.createdCount),
        travelPassengerCount: nonNegativeInt(response.bookings.travelPassengerCount),
        cancelledCount: response.bookings.cancellationContractStatus === 'ready' ? nonNegativeInt(response.bookings.cancelledCount) : null,
        refundedCount: response.bookings.refundContractStatus === 'ready' ? nonNegativeInt(response.bookings.refundedCount) : null,
        cancellationContractStatus: response.bookings.cancellationContractStatus || 'unsupported_missing_cancelledAt',
        refundContractStatus: response.bookings.refundContractStatus || 'unsupported_missing_refund_timestamp',
        cancellationMessage: response.bookings.cancellationContractStatus === 'ready' ? '' : 'ยังไม่รองรับข้อมูลวันยกเลิก',
        refundMessage: response.bookings.refundContractStatus === 'ready' ? '' : 'contract วันคืนเงินยังไม่ครบ',
        createdDateSource: response.bookings.createdDateSource || 'ts',
        travelDateSource: response.bookings.travelDateSource || 'date/serviceDate',
        count: nonNegativeInt(response.bookings.createdCount),
        points: response.bookings.points.map(function (point) { return validatePoint(point, 'bookings'); })
      },
      refunds: { status: response.bookings.refundContractStatus === 'ready' ? response.status : 'unsupported', count: response.bookings.refundContractStatus === 'ready' ? nonNegativeInt(response.bookings.refundedCount) : null, pendingCount: response.bookings.refundContractStatus === 'ready' ? nonNegativeInt(response.bookings.refundedCount) : null, refundedAmount: money(response.finance && response.finance.refundAmount), message: response.bookings.refundContractStatus === 'ready' ? '' : 'contract วันคืนเงินยังไม่ครบ' },
      revenue: Object.assign({
        status: response.status,
        amount: money(response.finance && response.finance.netAmount),
        grossPassengerPayment: money(response.finance && response.finance.grossAmount),
        fareCollected: money(response.finance && response.finance.fareAmount),
        platformServiceFeeRevenue: money(response.finance && response.finance.serviceFeeAmount)
      }, response.finance || {}),
      vehicleSettlements: { status: response.status, rows: validateRows(response.vehicles) },
      queueSettlements: { status: response.status, rows: validateRows(response.queues) },
      routeSettlements: { status: response.status, rows: validateRows(response.routes) },
      finance: response.finance || {},
      diagnostic: response.diagnostic || null,
      health: { Booking: response.status, GPS: 'ไม่มีข้อมูล', Notification: 'ไม่มีข้อมูล', ERP: 'ไม่มีข้อมูล', DriverApp: 'ไม่มีข้อมูล' },
      activities: { status: 'empty', items: [], errors: [], sources: {} },
      sources: { dashboardSummary: { status: response.status, path: 'readAdminDashboardSummary' } },
      generatedAt: Number(response.generatedAt) || Date.now()
    };
  }

  function blank(status, range, error) {
    return {
      status: status || 'loading',
      range: range || 'daily',
      visits: { status: status || 'loading', range: range || 'daily', points: [], visitors: null, actualUsers: null },
      bookings: { status: status || 'loading', points: [], createdCount: null, travelPassengerCount: null, cancelledCount: null, refundedCount: null, count: null },
      refunds: { status: status || 'loading', count: null, pendingCount: null },
      revenue: { status: status || 'loading', grossAmount: null, fareAmount: null, serviceFeeAmount: null, refundAmount: null, netAmount: null },
      vehicleSettlements: { status: status || 'loading', rows: [] },
      queueSettlements: { status: status || 'loading', rows: [] },
      routeSettlements: { status: status || 'loading', rows: [] },
      health: {},
      activities: { status: status || 'loading', items: [], errors: [], sources: {} },
      error: error || null
    };
  }

  function refresh(params) {
    params = params || {};
    var range = params.range || 'daily';
    var anchor = params.anchor || params.serviceDate || todayBangkok();
    if (!RANGE_SIZES[range]) return Promise.resolve(blank('error', range, 'invalid_range'));
    var seq = ++requestSeq;
    if (typeof fetch !== 'function') return Promise.resolve(blank('error', range, 'fetch_unavailable'));
    return fetch(ENDPOINT + '?range=' + encodeURIComponent(range) + '&anchor=' + encodeURIComponent(anchor), {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('readAdminDashboardSummary HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      if (seq !== requestSeq) return CACHE[cacheKey({ range: range, anchor: anchor })] || blank('loading', range);
      var model = validateResponse(range, json);
      CACHE[cacheKey({ range: range, anchor: anchor })] = model;
      try { global.dispatchEvent(new CustomEvent('sltransit:admin-dashboard-updated')); } catch (e) { /* no-op */ }
      return model;
    }).catch(function (err) {
      if (seq !== requestSeq) return CACHE[cacheKey({ range: range, anchor: anchor })] || blank('loading', range);
      var model = blank('error', range, err && err.message ? err.message : String(err));
      CACHE[cacheKey({ range: range, anchor: anchor })] = model;
      try { global.dispatchEvent(new CustomEvent('sltransit:admin-dashboard-updated')); } catch (e) { /* no-op */ }
      return model;
    });
  }

  function getSnapshot(params) {
    var key = cacheKey(params || {});
    return CACHE[key] || blank('loading', (params && params.range) || 'daily');
  }

  var api = { load: function (_, params) { return refresh(params || {}); }, refresh: refresh, getSnapshot: getSnapshot, validateResponse: validateResponse, _clearCacheForTest: function () { CACHE = {}; requestSeq = 0; } };
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.adminDashboardReadModel = api;
  global.SLTransit.screen01ReadModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
