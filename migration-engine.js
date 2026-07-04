(function(global) {
  'use strict';

  var STATUS_MAP = {
    pending: 'awaiting_payment',
    unpaid: 'awaiting_payment',
    awaiting_payment: 'awaiting_payment',
    paid: 'confirmed',
    payment_verified: 'confirmed',
    confirmed: 'confirmed',
    checked_in: 'checked_in',
    completed: 'completed',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    refunded: 'refunded',
    expired: 'expired',
    no_show: 'no_show'
  };

  var VALID_STATUS = [
    'awaiting_payment',
    'confirmed',
    'checked_in',
    'completed',
    'cancelled',
    'refunded',
    'expired',
    'no_show'
  ];

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function normalizeStatus(status) {
    var key = String(status || 'pending').trim().toLowerCase();
    return STATUS_MAP[key] || key || 'awaiting_payment';
  }

  function keepBookingId(sourceId, booking) {
    return String((booking && (booking.bookingId || booking.id || booking.code)) || sourceId || '').trim();
  }

  function normalizeBooking(sourceId, booking) {
    var raw = valueOrEmpty(booking);
    var bookingId = keepBookingId(sourceId, raw);
    var status = normalizeStatus(raw.status);
    var warnings = [];
    if (!bookingId) warnings.push('missing booking id');
    if (VALID_STATUS.indexOf(status) === -1) warnings.push('unknown status: ' + status);
    return {
      sourceId: String(sourceId || bookingId || ''),
      targetPath: bookingId ? 'operations/bookings/' + bookingId : '',
      bookingId: bookingId,
      status: status,
      warnings: warnings,
      data: Object.assign({}, raw, {
        bookingId: bookingId,
        status: status,
        migratedFrom: raw.migratedFrom || 'legacy',
        migrationCheckedAt: new Date().toISOString()
      })
    };
  }

  function buildMigrationPreview(bookings) {
    var raw = valueOrEmpty(bookings);
    var rows = Object.keys(raw).map(function(key) {
      return normalizeBooking(key, raw[key]);
    });
    var summary = rows.reduce(function(acc, row) {
      acc.total += 1;
      acc.statuses[row.status] = (acc.statuses[row.status] || 0) + 1;
      if (row.warnings.length) acc.warningCount += 1;
      return acc;
    }, { total: 0, warningCount: 0, statuses: {} });
    return { summary: summary, rows: rows };
  }

  function validateMigrationPreview(preview) {
    var rows = Array.isArray(preview) ? preview : valueOrEmpty(preview).rows || [];
    var seen = {};
    var issues = [];
    rows.forEach(function(row, index) {
      var id = row && row.bookingId;
      if (!id) issues.push({ level: 'error', index: index, message: 'missing booking id' });
      if (id && seen[id]) issues.push({ level: 'error', bookingId: id, message: 'duplicate booking id' });
      if (id) seen[id] = true;
      if (row && row.warnings && row.warnings.length) {
        row.warnings.forEach(function(warning) {
          issues.push({ level: 'warning', bookingId: id || '', message: warning });
        });
      }
      if (row && row.status && VALID_STATUS.indexOf(row.status) === -1) {
        issues.push({ level: 'error', bookingId: id || '', message: 'invalid mapped status: ' + row.status });
      }
    });
    return {
      ok: issues.filter(function(issue) { return issue.level === 'error'; }).length === 0,
      total: rows.length,
      issueCount: issues.length,
      issues: issues
    };
  }

  function buildMigrationPlan(bookings, options) {
    var preview = buildMigrationPreview(bookings);
    var validation = validateMigrationPreview(preview);
    var updates = buildUpdateMap(preview);
    return {
      dryRun: true,
      generatedAt: (options && options.generatedAt) || new Date().toISOString(),
      source: (options && options.source) || 'legacy-bookings-json',
      targetRoot: 'operations/bookings',
      summary: preview.summary,
      validation: validation,
      updates: updates
    };
  }

  function assessMigrationReadiness(plan) {
    var p = valueOrEmpty(plan);
    var validation = valueOrEmpty(p.validation);
    var updates = valueOrEmpty(p.updates);
    var updateCount = Object.keys(updates).length;
    var blockers = [];
    if (p.dryRun !== true) blockers.push('plan must be dryRun=true');
    if (!validation.ok) blockers.push('validation has errors');
    if (!updateCount) blockers.push('plan has no booking updates');
    if (p.targetRoot !== 'operations/bookings') blockers.push('targetRoot must be operations/bookings');
    return {
      readyForManualReview: blockers.length === 0,
      readyForApply: false,
      updateCount: updateCount,
      blockers: blockers,
      nextRequiredApproval: 'Owner must approve real Firebase migration separately'
    };
  }

  function buildUpdateMap(preview) {
    var rows = Array.isArray(preview) ? preview : valueOrEmpty(preview).rows || [];
    return rows.reduce(function(updates, row) {
      if (row && row.targetPath && row.data) updates[row.targetPath] = row.data;
      return updates;
    }, {});
  }

  var api = {
    VALID_STATUS: VALID_STATUS.slice(),
    STATUS_MAP: Object.assign({}, STATUS_MAP),
    normalizeStatus: normalizeStatus,
    normalizeBooking: normalizeBooking,
    buildMigrationPreview: buildMigrationPreview,
    validateMigrationPreview: validateMigrationPreview,
    buildMigrationPlan: buildMigrationPlan,
    assessMigrationReadiness: assessMigrationReadiness,
    buildUpdateMap: buildUpdateMap
  };

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.migration = api;
})(window);
