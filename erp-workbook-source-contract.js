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
    schedule: ['scheduleOfferId', 'routeId', 'serviceGroupId', 'originNameTh', 'destinationNameTh', 'fromStopKey', 'toStopKey', 'departureTime', 'arrivalTime', 'serviceDays', 'bookingEnabled', 'capacity', 'note']
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

  function rowValues(row) { return Object.keys(object(row)).map(function(key) { return row[key]; }); }
  function cleanKey(value) { return String(value == null ? '' : value).trim(); }
  function normalizeTimeValue(value) {
    if (typeof value === 'number' && value >= 0 && value < 1) {
      var totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
      return String(Math.floor(totalMinutes / 60)).padStart(2, '0') + ':' + String(totalMinutes % 60).padStart(2, '0');
    }
    return cleanKey(value);
  }
  function groupIdFromRoute(routeId) { var match = cleanKey(routeId).match(/^G_(\d{3})-/i); return match ? 'group_' + match[1] : ''; }
  function groupIdFromName(value) {
    var name = cleanKey(value);
    return name === 'group_001' || name.indexOf('สนามชัยเขต') !== -1 ? 'group_001' : name.indexOf('หมอชิต') !== -1 || name.indexOf('เอกมัย') !== -1 ? 'group_002' : name.indexOf('พัทยา') !== -1 || name.indexOf('ระยอง') !== -1 || name.indexOf('มีนบุรี') !== -1 ? 'group_003' : name.indexOf('รังสิต') !== -1 ? 'group_004' : name.indexOf('รถไฟ') !== -1 || name.indexOf('สถานีรถไฟ') !== -1 ? 'group_005' : /^group_00[1-5]$/.test(name) ? name : '';
  }
  function buildMasterData(workbook) {
    var groupSheet = findSheet(workbook, '02_').sheet, fareSheet = findSheet(workbook, '03_').sheet, scheduleSheet = findSheet(workbook, '04_').sheet, queueScheduleSheet = findSheet(workbook, '05_').sheet, vehicleSheet = findSheet(workbook, '06_').sheet, mappingSheet = findSheet(workbook, '08_').sheet;
    var groups = {};
    nonBlankRows(groupSheet).forEach(function(row) { var v = rowValues(row), id = cleanKey(v[0]); if (!id) return; groups[id] = { serviceGroupId: id, displayNameTh: cleanKey(v[1]), sortOrder: v[2], groupType: cleanKey(v[3]), transferStopKey: cleanKey(v[4]), minTransferMinutes: v[5], maxWaitMinutes: v[6], idealWaitMinutes: v[7], reliability: v[8], recommendationPriority: v[9], passengerChoiceEnabled: cleanKey(v[10]) !== 'ไม่', status: cleanKey(v[11]) === 'ไม่' ? 'inactive' : 'active' }; });
    var vehicles = {}, sensitiveCredentialCount = 0;
    nonBlankRows(vehicleSheet).forEach(function(row) { var v = rowValues(row), id = cleanKey(v[0]); if (!id || id === 'vehicle_id') return; if (cleanKey(v[11])) sensitiveCredentialCount++; vehicles[id] = { vehicleId: id, legacyAlias: cleanKey(v[1]), queueId: cleanKey(v[2]), assignmentMode: cleanKey(v[3]), registrationNo: cleanKey(v[4]), active: cleanKey(v[6]) !== 'ไม่', driverId: cleanKey(v[7]), note: cleanKey(v[12]), serviceGroupId: '' }; });
    nonBlankRows(mappingSheet).forEach(function(row) { var v = rowValues(row), runtimeId = cleanKey(v[0]); if (!runtimeId || runtimeId === 'runtimeVehicleId' || runtimeId === 'Driver App Vehicle Group Mapping') return; var vehicle = Object.keys(vehicles).map(function(key) { return vehicles[key]; }).filter(function(item) { return item.legacyAlias === runtimeId; })[0]; if (vehicle) vehicle.serviceGroupId = groupIdFromName(v[2] || v[3]); });
    var schedule = nonBlankRows(scheduleSheet).map(function(row) { var v = rowValues(row), routeId = cleanKey(v[1]), groupId = groupIdFromRoute(routeId) || groupIdFromName(v[2]); return { scheduleOfferId: cleanKey(v[0]), routeId: routeId, serviceGroupId: groupId, originNameTh: cleanKey(v[3]), destinationNameTh: cleanKey(v[4]), departureTime: v[5], bookingEnabled: cleanKey(v[6]) !== 'ไม่', capacity: v[7], note: cleanKey(v[8]), arrivalTime: '', serviceDays: [] }; }).filter(function(row) { return !!row.scheduleOfferId; });
    var queueSchedule = nonBlankRows(queueScheduleSheet).map(function(row) {
      var v = rowValues(row);
      return {
        queueScheduleId: 'queue_schedule_' + String(v[0] || '').trim() + '_' + String(v[1] || '').trim() + '_' + String(v[2] || '').trim(),
        queueNumber: v[0], sourceQueueTripId: cleanKey(v[1]), stopSequence: v[2], routeId: cleanKey(v[3]),
        canonicalQueueTripId: cleanKey(v[3]),
        queueId: (cleanKey(v[3]).match(/-Q_[^-]+/) || [''])[0].replace(/^-/, ''),
        routeLabelTh: cleanKey(v[4]), stopKey: cleanKey(v[5]), stopNameTh: cleanKey(v[6]),
        scheduledTime: normalizeTimeValue(v[7]), sourceSheet: findSheet(workbook, '05_').name
      };
    }).filter(function(row) { return !!row.sourceQueueTripId && !!row.stopKey; });
    var queueTrips = {};
    queueSchedule.forEach(function(row) {
      var id = row.canonicalQueueTripId;
      if (!queueTrips[id]) queueTrips[id] = { queueTripId: id, queueId: row.queueId, serviceGroupId: groupIdFromRoute(id), stopTimes: [], serviceDays: null, dayPatternStatus: 'requires_explicit_source_mapping' };
      queueTrips[id].stopTimes.push({ stopSequence: row.stopSequence, stopKey: row.stopKey, stopNameTh: row.stopNameTh, scheduledTime: row.scheduledTime });
    });
    Object.keys(queueTrips).forEach(function(id) {
      queueTrips[id].stopTimes.sort(function(a, b) { return Number(a.stopSequence) - Number(b.stopSequence); });
    });
    var vehicleQueueAssignments = Object.keys(vehicles).reduce(function(map, id) {
      var vehicle = vehicles[id];
      map[id] = { vehicleId: id, legacyAlias: vehicle.legacyAlias, queueScope: vehicle.queueId, assignmentMode: vehicle.assignmentMode, serviceGroupId: vehicle.serviceGroupId };
      return map;
    }, {});
    var servicePolicies = {
      group_001: { policyId: 'service_policy_group_001_v1', serviceGroupId: 'group_001', serviceDays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'], scheduleMode: 'daily_fixed', publicationMode: 'admin_published_snapshot', adminPublishRequired: true, consumerReadSource: 'publishedSchedule', source: 'owner_instruction_2026-08-08' }
    };
    var schedulePublicationPolicy = {
      schemaVersion: 'schedule-publication-policy.v1',
      effectiveDateRequiredForDynamic: true,
      publishedAtRequired: true,
      expiresAtRequiredForDynamic: true,
      knownServiceGroups: ['group_001'],
      unknownServiceGroups: ['group_002', 'group_003', 'group_004', 'group_005'],
      dynamicServiceGroups: [],
      dynamicDayProfiles: [],
      fixedIntervalServiceGroups: [],
      staleSnapshotMustNotBeUsed: true,
      productionApplyAllowed: false,
      noPublishedScheduleBehavior: 'hide',
      consumerDisplayRule: 'show_only_published_rows',
      publicationFlow: ['draft', 'validate', 'admin_publish', 'consumer_read_published_snapshot'],
      singleConsumerReadSource: 'publishedSchedule',
      adminPublishRequired: true
    };
    return { serviceGroups: groups, vehicles: vehicles, scheduleRows: schedule, queueScheduleRows: queueSchedule, queueTrips: queueTrips, vehicleQueueAssignments: vehicleQueueAssignments, servicePolicies: servicePolicies, schedulePublicationPolicy: schedulePublicationPolicy, sensitiveCredentialCount: sensitiveCredentialCount };
  }

  var FIELD_ALIASES = {
    scheduleOfferId: ['scheduleOfferId', 'trip_id', 'tripId', 'รหัสรอบ (trip_id)'], routeId: ['routeId', 'route_id', 'รหัสเส้นทาง (route_id)'], serviceGroupId: ['serviceGroupId', 'group_id', 'groupId', 'ชื่อกลุ่ม'],
    originNameTh: ['originNameTh', 'origin', 'ต้นทาง'], destinationNameTh: ['destinationNameTh', 'destination', 'ปลายทาง'], fromStopKey: ['fromStopKey', 'from_stop_key', 'รหัสระบบต้นทาง'], toStopKey: ['toStopKey', 'to_stop_key', 'รหัสระบบปลายทาง'],
    departureTime: ['departureTime', 'departure_time', 'เวลาออก'], arrivalTime: ['arrivalTime', 'arrival_time', 'arriveTime', 'destinationArrivalTime', 'เวลาถึงปลายทาง'], serviceDays: ['serviceDays', 'service_days', 'วันให้บริการ'],
    bookingEnabled: ['bookingEnabled', 'booking_enabled', 'เปิดจอง'], capacity: ['capacity', 'จำนวนคนสูงสุด'], note: ['note', 'หมายเหตุ']
  };
  function sourceValue(values, field, sourceKeys, fieldIndex) {
    var aliases = FIELD_ALIASES[field] || [], match = aliases.filter(function(alias) { return Object.prototype.hasOwnProperty.call(values, alias); })[0];
    if (match) return values[match];
    if (field === 'fromStopKey' || field === 'toStopKey' || field === 'arrivalTime' || field === 'serviceDays') return null;
    return fieldIndex < sourceKeys.length ? values[sourceKeys[fieldIndex]] : null;
  }

  function sourceMap(rows, kind, sheetName) {
    return rows.reduce(function(map, values, index) {
      var rowNumber = index + 2;
      var sourceRowId = kind + '_' + String(rowNumber).padStart(4, '0');
      var canonical = {};
      var sourceKeys = Object.keys(object(values));
      (CANONICAL_FIELDS[kind] || []).forEach(function(field, fieldIndex) {
        var value = sourceValue(values, field, sourceKeys, fieldIndex);
        if ((field === 'departureTime' || field === 'arrivalTime') && typeof value === 'number' && value >= 0 && value < 1) {
          var totalMinutes = Math.round(value * 24 * 60) % (24 * 60);
          value = String(Math.floor(totalMinutes / 60)).padStart(2, '0') + ':' + String(totalMinutes % 60).padStart(2, '0');
        }
        canonical[field] = value;
      });
      if (kind === 'schedule') canonical.serviceGroupId = groupIdFromRoute(canonical.routeId) || groupIdFromName(canonical.serviceGroupId);
      map[sourceRowId] = Object.assign(canonical, {
        sourceRowId: sourceRowId,
        sourceSheet: sheetName,
        sourceRowNumber: rowNumber,
        sourceValues: Object.assign({}, values)
      });
      return map;
    }, {});
  }

  function buildIdRegistry(candidate) {
    var entities = { serviceGroups: {}, routes: {}, trips: {}, queueTrips: {}, vehicles: {} };
    var aliasClaims = {};
    function register(collection, entityType, canonicalId, aliases, sourceRefs) {
      if (!canonicalId) return;
      var cleanAliases = aliases.filter(function(alias, index, list) { return alias && list.indexOf(alias) === index; });
      entities[collection][canonicalId] = { entityType: entityType, canonicalId: canonicalId, aliases: cleanAliases, sourceRefs: sourceRefs || [] };
      cleanAliases.forEach(function(alias) {
        var claimKey = entityType + ':' + alias;
        if (!aliasClaims[claimKey]) aliasClaims[claimKey] = [];
        aliasClaims[claimKey].push(canonicalId);
      });
    }
    Object.keys(object(candidate.masterData && candidate.masterData.serviceGroups)).forEach(function(id) {
      var group = candidate.masterData.serviceGroups[id];
      register('serviceGroups', 'serviceGroup', id, [id], ['02_กลุ่มบริการ']);
    });
    Object.keys(object(candidate.routeFareRows)).forEach(function(sourceRowId) {
      var row = candidate.routeFareRows[sourceRowId];
      if (!entities.routes[row.routeId]) register('routes', 'route', row.routeId, [row.routeId], [sourceRowId]);
    });
    Object.keys(object(candidate.scheduleRows)).forEach(function(sourceRowId) {
      var row = candidate.scheduleRows[sourceRowId];
      register('trips', 'trip', row.scheduleOfferId, [row.scheduleOfferId, sourceRowId], [sourceRowId]);
    });
    var queueTripAliases = {};
    (candidate.masterData && candidate.masterData.queueScheduleRows || []).forEach(function(row) {
      var canonicalId = row.canonicalQueueTripId || row.routeId;
      if (!canonicalId) return;
      if (!queueTripAliases[canonicalId]) queueTripAliases[canonicalId] = { aliases: [], sourceRefs: [] };
      [row.routeId, 'queue_' + String(row.queueNumber || '').trim() + '_trip_' + String(row.sourceQueueTripId || '').trim(), row.queueScheduleId].forEach(function(alias) {
        if (alias && queueTripAliases[canonicalId].aliases.indexOf(alias) === -1) queueTripAliases[canonicalId].aliases.push(alias);
      });
      if (row.queueScheduleId && queueTripAliases[canonicalId].sourceRefs.indexOf(row.queueScheduleId) === -1) queueTripAliases[canonicalId].sourceRefs.push(row.queueScheduleId);
    });
    Object.keys(queueTripAliases).forEach(function(canonicalId) {
      register('queueTrips', 'queueTrip', canonicalId, queueTripAliases[canonicalId].aliases, queueTripAliases[canonicalId].sourceRefs);
    });
    Object.keys(object(candidate.masterData && candidate.masterData.vehicles)).forEach(function(id) {
      var vehicle = candidate.masterData.vehicles[id];
      register('vehicles', 'vehicle', vehicle.vehicleId, [vehicle.vehicleId, vehicle.legacyAlias], ['06_รถ', '08_mapping']);
    });
    var collisions = Object.keys(aliasClaims).filter(function(key) {
      return aliasClaims[key].filter(function(id, index, list) { return list.indexOf(id) === index; }).length > 1;
    }).map(function(key) { return { aliasKey: key, canonicalIds: aliasClaims[key].filter(function(id, index, list) { return list.indexOf(id) === index; }) }; });
    return {
      schemaVersion: 'owner-master-id-registry.v1',
      policy: 'canonical-id-with-source-aliases',
      entities: entities,
      collisions: collisions,
      valid: collisions.length === 0
    };
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
    var missingArrivalTimes = Object.keys(scheduleRows).filter(function(key) { return !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(scheduleRows[key].arrivalTime || '')); });
    var missingServiceDays = Object.keys(scheduleRows).filter(function(key) { return !String(scheduleRows[key].serviceDays || '').trim(); });
    if (invalidScheduleTimes.length) blockers.push({
      code: 'schedule-time-format-invalid', count: invalidScheduleTimes.length, sourceRowIds: invalidScheduleTimes
    });
    var operationalScheduleBlockers = (missingArrivalTimes.length ? [{ code: 'schedule-arrival-time-missing-or-invalid', count: missingArrivalTimes.length, sourceRowIds: missingArrivalTimes }] : []).concat(missingServiceDays.length ? [{ code: 'schedule-service-days-missing', count: missingServiceDays.length, sourceRowIds: missingServiceDays }] : []);
    var groupReadiness = {};
    ['group_001', 'group_002', 'group_003', 'group_004', 'group_005'].forEach(function(groupId) {
      var groupRows = Object.keys(scheduleRows).filter(function(key) { return scheduleRows[key].serviceGroupId === groupId; }).map(function(key) { return scheduleRows[key]; });
      var groupQueueTrips = Object.keys(object(candidate.masterData && candidate.masterData.queueTrips)).filter(function(key) { return candidate.masterData.queueTrips[key].serviceGroupId === groupId; }).map(function(key) { return candidate.masterData.queueTrips[key]; });
      var groupMissingDays = groupRows.filter(function(row) { return !String(row.serviceDays || '').trim(); });
      var groupDepartureIssues = groupRows.filter(function(row) { return !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(row.departureTime || '')); });
      var queueTimeIssues = groupQueueTrips.filter(function(trip) { return !trip.stopTimes || !trip.stopTimes.length || trip.stopTimes.some(function(stop) { return !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(stop.scheduledTime || '')); }); });
      var approved = groupId === 'group_001';
      groupReadiness[groupId] = { serviceGroupId: groupId, approvedScope: approved, scheduleRows: groupRows.length, queueTrips: groupQueueTrips.length, exactQueueStopTimesReady: queueTimeIssues.length === 0 && groupQueueTrips.length > 0, departureTimesReady: groupDepartureIssues.length === 0, serviceDaysReady: groupMissingDays.length === 0, operationalReady: approved && groupDepartureIssues.length === 0 && groupMissingDays.length === 0 && queueTimeIssues.length === 0 && groupQueueTrips.length > 0, blockers: approved ? [].concat(groupDepartureIssues.length ? [{ code: 'group-departure-time-invalid', count: groupDepartureIssues.length }] : [], groupMissingDays.length ? [{ code: 'group-service-days-missing', count: groupMissingDays.length }] : [], queueTimeIssues.length ? [{ code: 'group-queue-stop-time-missing-or-invalid', count: queueTimeIssues.length }] : []) : [{ code: 'group-outside-approved-scope' }] };
    });
    return {
      valid: blockers.length === 0,
      networkReady: blockers.length === 0,
      operationalScheduleReady: operationalScheduleBlockers.length === 0,
      networkBlockers: operationalScheduleBlockers,
      operationalScheduleBlockers: operationalScheduleBlockers,
      approvedScope: ['group_001'],
      groupReadiness: groupReadiness,
      blockers: blockers,
      counts: { routeFareRows: fareCount, scheduleRows: scheduleCount }
    };
  }

  function applyServicePolicies(candidate) {
    var policies = object(candidate.masterData && candidate.masterData.servicePolicies);
    Object.keys(object(candidate.scheduleRows)).forEach(function(key) {
      var row = candidate.scheduleRows[key];
      var policy = policies[row.serviceGroupId];
      row.publicationMode = policy && policy.publicationMode || 'admin_published_snapshot';
      row.adminPublishRequired = !policy || policy.adminPublishRequired !== false;
      row.consumerReadSource = policy && policy.consumerReadSource || 'publishedSchedule';
      row.displayWhenPublished = true;
      row.hideWhenUnpublished = true;
      if (!policy) return;
      if (row.serviceGroupId === 'group_003') {
        row.serviceDays = policy.confirmedDays.slice();
        row.scheduleMode = policy.scheduleMode;
        row.dynamicDays = policy.dynamicDays.slice();
      } else if (policy.serviceDays) {
        row.serviceDays = policy.serviceDays.slice();
        row.scheduleMode = policy.scheduleMode;
        row.scheduleFreshness = policy.freshness || 'static';
      }
    });
    return candidate;
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
    candidate.masterData = buildMasterData(workbook);
    candidate.masterData.serviceGroups = candidate.masterData.serviceGroups;
    candidate.masterData.vehicles = candidate.masterData.vehicles;
    candidate.masterData.scheduleRows = candidate.masterData.scheduleRows;
    candidate.idRegistry = buildIdRegistry(candidate);
    applyServicePolicies(candidate);
    candidate.reconciliation = validateCandidate(candidate);
    candidate.manifest = {
      sourceWorkbookName: candidate.sourceWorkbookName,
      schemaVersion: CONTRACT.schemaVersion,
      routeFareRowsMeaning: CONTRACT.routeFareMeaning,
      scheduleRowsMeaning: CONTRACT.scheduleMeaning,
      publishedPairsMeaning: CONTRACT.publishedPairsMeaning,
      counts: Object.assign({}, candidate.reconciliation.counts),
      masterDataCounts: {
        serviceGroups: Object.keys(candidate.masterData.serviceGroups || {}).length,
        vehicles: Object.keys(candidate.masterData.vehicles || {}).length,
        scheduleRows: (candidate.masterData.scheduleRows || []).length,
        queueScheduleRows: (candidate.masterData.queueScheduleRows || []).length,
        queueTrips: Object.keys(candidate.masterData.queueTrips || {}).length,
        sensitiveCredentialCount: candidate.masterData.sensitiveCredentialCount || 0
      },
      idRegistry: {
        schemaVersion: candidate.idRegistry.schemaVersion,
        valid: candidate.idRegistry.valid,
        serviceGroups: Object.keys(candidate.idRegistry.entities.serviceGroups).length,
        routes: Object.keys(candidate.idRegistry.entities.routes).length,
        trips: Object.keys(candidate.idRegistry.entities.trips).length,
        queueTrips: Object.keys(candidate.idRegistry.entities.queueTrips).length,
        vehicles: Object.keys(candidate.idRegistry.entities.vehicles).length,
        collisions: candidate.idRegistry.collisions.length
      },
      networkReady: candidate.reconciliation.networkReady,
      operationalScheduleReady: candidate.reconciliation.operationalScheduleReady,
      readyForFirebaseReview: candidate.reconciliation.valid,
      networkReady: candidate.reconciliation.networkReady,
      readyForApply: false
    };
    return candidate;
  }

  var api = {
    CONTRACT: CONTRACT,
    buildCandidate: buildCandidate,
    validateCandidate: validateCandidate,
    applyServicePolicies: applyServicePolicies,
    buildIdRegistry: buildIdRegistry
  };

  global.SLTransitWorkbookSource = api;
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.workbookSource = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
