(function(global) {
  'use strict';

  var CONTRACT = Object.freeze({
    schemaVersion: 'erpWorkbookSource.v1',
    rootPath: 'data/erpDataCenter/workbookSource',
    routeFareRowsPath: 'data/erpDataCenter/workbookSource/routeFareRows',
    scheduleRowsPath: 'data/erpDataCenter/workbookSource/scheduleRows',
    manifestPath: 'data/erpDataCenter/workbookSource/manifest',
    reconciliationPath: 'data/erpDataCenter/workbookSource/reconciliation',
    expectedRouteFareRows: 244,
    expectedScheduleRows: 881,
    routeFareMeaning: 'one owner-workbook origin/destination fare row',
    scheduleMeaning: 'one owner-workbook timetable row',
    publishedPairsMeaning: 'derived booking and reference presentation pairs; not source fare rows'
  });
  var CANONICAL_FIELDS = Object.freeze({
    fare: ['routeId', 'serviceGroupId', 'displayOrder', 'fromStopKey', 'fromNameTh', 'toStopKey', 'toNameTh', 'amount', 'status'],
    schedule: ['scheduleOfferId', 'routeId', 'serviceGroupId', 'originNameTh', 'destinationNameTh', 'departureTime', 'bookingEnabled', 'capacity', 'note']
  });

  function object(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function nonBlankRows(sheet) {
    return Array.isArray(sheet && sheet.rows) ? sheet.rows.filter(function(row) {
      return Object.keys(object(row)).some(function(key) {
        return String(row[key] == null ? '' : row[key]).trim() !== '';
      });
    }) : [];
  }

  function findSheet(workbook, prefix) {
    var sheets = object(workbook && workbook.sheets);
    var name = Object.keys(sheets).find(function(key) { return key.indexOf(prefix) === 0; });
    return { name: name || '', sheet: name ? sheets[name] : null };
  }

  function sourceMap(rows, kind, sheetName) {
    return rows.reduce(function(map, values, index) {
      var rowNumber = index + 2;
      var sourceRowId = kind + '_' + String(rowNumber).padStart(4, '0');
      var canonical = {};
      var sourceKeys = Object.keys(object(values));
      (CANONICAL_FIELDS[kind] || []).forEach(function(field, fieldIndex) {
        var value = fieldIndex < sourceKeys.length ? values[sourceKeys[fieldIndex]] : null;
        if (field === 'departureTime' && typeof value === 'number' && value >= 0 && value < 1) {
          var totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
          value = String(Math.floor(totalMinutes / 60)).padStart(2, '0') + ':' + String(totalMinutes % 60).padStart(2, '0');
        }
        canonical[field] = value;
      });
      map[sourceRowId] = Object.assign(canonical, {
        sourceRowId: sourceRowId,
        sourceSheet: sheetName,
        sourceRowNumber: rowNumber,
        sourceValues: Object.assign({}, values)
      });
      return map;
    }, {});
  }

  function validateCandidate(candidate) {
    var routeFareRows = object(candidate && candidate.routeFareRows);
    var scheduleRows = object(candidate && candidate.scheduleRows);
    var fareCount = Object.keys(routeFareRows).length;
    var scheduleCount = Object.keys(scheduleRows).length;
    var blockers = [];
    if (fareCount !== CONTRACT.expectedRouteFareRows) blockers.push({
      code: 'route-fare-row-count-mismatch', expected: CONTRACT.expectedRouteFareRows, actual: fareCount
    });
    if (scheduleCount !== CONTRACT.expectedScheduleRows) blockers.push({
      code: 'schedule-row-count-mismatch', expected: CONTRACT.expectedScheduleRows, actual: scheduleCount
    });
    var invalidScheduleTimes = Object.keys(scheduleRows).filter(function(key) {
      return !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(scheduleRows[key].departureTime || ''));
    });
    if (invalidScheduleTimes.length) blockers.push({
      code: 'schedule-time-format-invalid', count: invalidScheduleTimes.length, sourceRowIds: invalidScheduleTimes
    });
    return {
      valid: blockers.length === 0,
      blockers: blockers,
      counts: { routeFareRows: fareCount, scheduleRows: scheduleCount }
    };
  }

  function buildCandidate(workbook) {
    var fareSheet = findSheet(workbook, '03_');
    var scheduleSheet = findSheet(workbook, '04_');
    var candidate = {
      schemaVersion: CONTRACT.schemaVersion,
      sourceWorkbookName: workbook && workbook.name || '',
      routeFareRows: sourceMap(nonBlankRows(fareSheet.sheet), 'fare', fareSheet.name),
      scheduleRows: sourceMap(nonBlankRows(scheduleSheet.sheet), 'schedule', scheduleSheet.name)
    };
    candidate.reconciliation = validateCandidate(candidate);
    candidate.manifest = {
      sourceWorkbookName: candidate.sourceWorkbookName,
      schemaVersion: CONTRACT.schemaVersion,
      routeFareRowsMeaning: CONTRACT.routeFareMeaning,
      scheduleRowsMeaning: CONTRACT.scheduleMeaning,
      publishedPairsMeaning: CONTRACT.publishedPairsMeaning,
      counts: Object.assign({}, candidate.reconciliation.counts),
      readyForFirebaseReview: candidate.reconciliation.valid,
      readyForApply: false
    };
    return candidate;
  }

  var api = {
    CONTRACT: CONTRACT,
    buildCandidate: buildCandidate,
    validateCandidate: validateCandidate
  };

  global.SLTransitWorkbookSource = api;
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.workbookSource = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
