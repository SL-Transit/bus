(function(global) {
  'use strict';

  var SCHEMA_VERSION = 'erp/backbone-v1';

  var PATHS = {
    erpDataCenter: 'data/erpDataCenter',
    settings: 'data/erpDataCenter/settings',
    destinations: 'data/erpDataCenter/destinations',
    stops: 'data/erpDataCenter/stops',
    boardingPoints: 'data/erpDataCenter/boardingPoints',
    terminals: 'data/erpDataCenter/terminals',
    providers: 'data/erpDataCenter/providers',
    serviceGroups: 'data/erpDataCenter/serviceGroups',
    routes: 'data/erpDataCenter/routes',
    routeStopSequences: 'data/erpDataCenter/routeStopSequences',
    trips: 'data/erpDataCenter/trips',
    stopTimes: 'data/erpDataCenter/stopTimes',
    fares: 'data/erpDataCenter/fares',
    fareSegments: 'data/erpDataCenter/fareSegments',
    transferRules: 'data/erpDataCenter/transferRules',
    paymentOwnership: 'data/erpDataCenter/paymentOwnership',
    temporaryClosures: 'data/erpDataCenter/temporaryClosures',
    serviceFees: 'data/erpDataCenter/serviceFees',
    settlementRecipients: 'data/erpDataCenter/settlementRecipients',
    metaVersions: 'data/erpDataCenter/meta/versions',
    metaAudit: 'data/erpDataCenter/meta/audit',
    catalog: 'data/erpDataCenter/catalog',
    catalogStops: 'data/erpDataCenter/catalog/stops',
    catalogGroups: 'data/erpDataCenter/catalog/groups',
    catalogRoutes: 'data/erpDataCenter/catalog/routes',
    catalogTrips: 'data/erpDataCenter/catalog/trips',
    catalogFares: 'data/erpDataCenter/catalog/fares',
    catalogFareSegments: 'data/erpDataCenter/catalog/fareSegments',
    catalogServices: 'data/erpDataCenter/catalog/services',
    catalogStopTimes: 'data/erpDataCenter/catalog/stopTimes',
    catalogCapacities: 'data/erpDataCenter/catalog/capacities',
    catalogClosures: 'data/erpDataCenter/catalog/closures',
    fleet: 'data/erpDataCenter/fleet',
    fleetVehicles: 'data/erpDataCenter/fleet/vehicles',
    fleetQueues: 'data/erpDataCenter/fleet/queues',
    fleetAssignmentRules: 'data/erpDataCenter/fleet/assignmentRules',
    fleetDrivers: 'data/erpDataCenter/fleet/drivers',
    fleetQueueOwners: 'data/erpDataCenter/fleet/queueOwners',
    fleetVehicleLoginIndex: 'data/erpDataCenter/fleet/vehicleLoginIndex',
    finance: 'data/erpDataCenter/finance',
    financeTransactions: 'data/erpDataCenter/finance/transactions',
    providerRegistry: 'data/erpDataCenter/providerRegistry',
    operations: 'operations',
    operationsDailyAssignments: 'operations/dailyAssignments',
    operationsVehicleSessions: 'operations/vehicleSessions',
    operationsBookings: 'operations/bookings',
    operationsPassengers: 'operations/passengers',
    operationsLiveVehicles: 'operations/liveVehicles',
    operationsNotificationEvents: 'operations/notificationEvents',
    operationsNotificationDeliveries: 'operations/notificationDeliveries',
    operationsAuditLogs: 'operations/auditLogs'
  };

  var REQUIRED_COLLECTIONS = [
    'data/erpDataCenter/settings',
    'data/erpDataCenter/catalog/stops',
    'data/erpDataCenter/catalog/routes',
    'data/erpDataCenter/catalog/trips',
    'data/erpDataCenter/catalog/fares',
    'data/erpDataCenter/fleet/vehicles',
    'data/erpDataCenter/fleet/queues'
  ];

  var OPTIONAL_COLLECTIONS = [
    'data/erpDataCenter/destinations',
    'data/erpDataCenter/stops',
    'data/erpDataCenter/boardingPoints',
    'data/erpDataCenter/terminals',
    'data/erpDataCenter/providers',
    'data/erpDataCenter/serviceGroups',
    'data/erpDataCenter/routes',
    'data/erpDataCenter/routeStopSequences',
    'data/erpDataCenter/trips',
    'data/erpDataCenter/stopTimes',
    'data/erpDataCenter/fares',
    'data/erpDataCenter/fareSegments',
    'data/erpDataCenter/transferRules',
    'data/erpDataCenter/paymentOwnership',
    'data/erpDataCenter/temporaryClosures',
    'data/erpDataCenter/serviceFees',
    'data/erpDataCenter/settlementRecipients',
    'data/erpDataCenter/fleet/assignmentRules',
    'data/erpDataCenter/fleet/drivers',
    'data/erpDataCenter/meta/versions',
    'data/erpDataCenter/meta/audit',
    'data/erpDataCenter/catalog/groups',
    'data/erpDataCenter/catalog/fareSegments',
    'data/erpDataCenter/catalog/services',
    'data/erpDataCenter/catalog/stopTimes',
    'data/erpDataCenter/catalog/capacities',
    'data/erpDataCenter/catalog/closures',
    'data/erpDataCenter/fleet/queueOwners',
    'data/erpDataCenter/fleet/vehicleLoginIndex',
    'data/erpDataCenter/finance/transactions',
    'data/erpDataCenter/providerRegistry'
  ];

  var LEGACY_SOURCE_PATHS = ['data/settings', 'data/catalog', 'data/fleet', 'data/finance', 'publishedCatalog', 'routeData', 'settings/routes'];
  var RUNTIME_CONTRACT_PATHS = [
    'operations/dailyAssignments',
    'operations/vehicleSessions',
    'operations/liveVehicles',
    'operations/notificationEvents',
    'operations/notificationDeliveries'
  ];
  var PRIVATE_RUNTIME_PATHS = [
    'bookings',
    'testBookings',
    'operations/bookings',
    'passengers',
    'operations/passengers',
    'tickets',
    'ticketRecords',
    'checkins',
    'checkIns',
    'operations/tickets',
    'operations/checkins',
    'operations/checkIns',
    'driverLogs',
    'operations/driverLogs',
    'line_sent',
    'lineLogs',
    'test_line_logs',
    'mockLogs/checkTicketNotifications',
    'liveVehicles',
    'bus'
  ];
  var FORBIDDEN_ERP_DESCENDANT_NAMES = [
    'bookings',
    'testBookings',
    'passengers',
    'tickets',
    'ticketRecords',
    'ticketAccess',
    'checkIns',
    'driverLogs',
    'lineLogs'
  ];
  var FORBIDDEN_ERP_OPERATIONS_SUBTREES = [
    'data/erpDataCenter/operations/bookings',
    'data/erpDataCenter/operations/passengers',
    'data/erpDataCenter/operations/liveVehicles',
    'data/erpDataCenter/operations/notificationEvents',
    'data/erpDataCenter/operations/notificationDeliveries',
    'data/erpDataCenter/operations/vehicleSessions',
    'data/erpDataCenter/operations/dailyAssignments'
  ];

  var RECORD_REQUIREMENTS = {
    stop: ['stopKey', 'nameTh', 'order'],
    route: ['id', 'fromStopKey', 'toStopKey'],
    trip: ['id', 'routeId', 'departTime'],
    vehicle: ['vehicleId', 'status'],
    queue: ['queueId', 'groupId'],
    fare: ['paymentOwnership'],
    fareSegment: ['paymentOwnership']
  };

  var MASTER_DATA_ENTITIES = {
    destination: { path: 'data/erpDataCenter/destinations', idField: 'destinationId', labelFields: ['displayNameTh', 'displayNameEn', 'nameTh'] },
    stop: { path: 'data/erpDataCenter/stops', idField: 'stopKey', labelFields: ['displayNameTh', 'displayNameEn', 'nameTh'] },
    boardingPoint: { path: 'data/erpDataCenter/boardingPoints', idField: 'boardingPointId', labelFields: ['displayNameTh', 'displayNameEn', 'nameTh'] },
    terminal: { path: 'data/erpDataCenter/terminals', idField: 'terminalId', labelFields: ['displayNameTh', 'displayNameEn', 'nameTh'] },
    queue: { path: 'data/erpDataCenter/fleet/queues', idField: 'queueId', labelFields: ['displayNameTh', 'displayNameEn', 'name'] },
    provider: { path: 'data/erpDataCenter/providers', idField: 'providerId', labelFields: ['displayNameTh', 'displayNameEn', 'name'] },
    serviceGroup: { path: 'data/erpDataCenter/serviceGroups', idField: 'serviceGroupId', labelFields: ['displayNameTh', 'displayNameEn', 'name'] },
    route: { path: 'data/erpDataCenter/routes', idField: 'routeId', labelFields: ['displayNameTh', 'displayNameEn', 'name'] },
    vehicle: { path: 'data/erpDataCenter/fleet/vehicles', idField: 'vehicleId', labelFields: ['registrationNo', 'displayName'] },
    driver: { path: 'data/erpDataCenter/fleet/drivers', idField: 'driverId', labelFields: ['displayName'] },
    settlementRecipient: { path: 'data/erpDataCenter/settlementRecipients', idField: 'settlementRecipientId', labelFields: ['displayNameTh', 'displayNameEn', 'name'] },
    serviceFee: { path: 'data/erpDataCenter/serviceFees', idField: 'serviceFeeId', labelFields: ['displayName'] }
  };

  var VALID_MASTER_STATUS = ['draft', 'test', 'active', 'inactive', 'archived', 'provisional'];
  var SERVICE_FEE_POLICY = {
    currency: 'THB',
    defaultStandardFee: 5,
    defaultTrialEffectiveFee: 0,
    appliesTo: 'all_service_groups',
    includesExternalPayGroups: true
  };

  var VALID_LIVE_VEHICLE_STATUS = ['active', 'moving', 'idle', 'standby', 'off_duty', 'offline'];

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function pathOf(key) {
    return PATHS[key] || '';
  }

  function readPath(root, path) {
    return String(path || '').split('/').filter(Boolean).reduce(function(node, part) {
      if (!node || typeof node !== 'object') return undefined;
      return node[part];
    }, root || {});
  }

  function startsWithPath(path, prefix) {
    return path === prefix || path.indexOf(prefix + '/') === 0;
  }

  function walkSnapshotPaths(node, basePath, callback) {
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach(function(key) {
      var path = basePath ? basePath + '/' + key : key;
      callback(path, node[key]);
      walkSnapshotPaths(node[key], path, callback);
    });
  }

  function isForbiddenErpOperationsPath(path) {
    return FORBIDDEN_ERP_OPERATIONS_SUBTREES.some(function(prefix) { return startsWithPath(path, prefix); });
  }

  function forbiddenErpDescendantName(path) {
    if (!startsWithPath(path, PATHS.erpDataCenter)) return '';
    var parts = String(path || '').split('/').filter(Boolean);
    for (var i = 2; i < parts.length; i++) {
      if (FORBIDDEN_ERP_DESCENDANT_NAMES.indexOf(parts[i]) !== -1) return parts[i];
    }
    return '';
  }

  function hasCollection(root, path) {
    var value = readPath(root, path);
    return !!(value && typeof value === 'object' && Object.keys(value).length);
  }

  function missingFields(record, fields) {
    record = valueOrEmpty(record);
    return fields.filter(function(field) {
      return record[field] == null || record[field] === '';
    });
  }

  function scanMap(root, path, type, issues) {
    var map = valueOrEmpty(readPath(root, path));
    var fields = RECORD_REQUIREMENTS[type] || [];
    Object.keys(map).forEach(function(key) {
      var missing = missingFields(map[key], fields);
      if (missing.length) {
        issues.push({ level: 'warning', code: 'missing-required-fields', path: path + '/' + key, type: type, fields: missing });
      }
    });
  }
  function hasRecord(map, id) {
    return id != null && id !== '' && !!valueOrEmpty(map)[id];
  }

  function addReferenceIssue(issues, path, field, targetPath, targetId, code) {
    issues.push({
      level: 'warning',
      code: code || 'missing-reference',
      path: path,
      field: field,
      targetPath: targetPath,
      targetId: targetId
    });
  }


  function addValidationIssue(issues, path, field, code, value) {
    issues.push({
      level: 'warning',
      code: code,
      path: path,
      field: field,
      value: value
    });
  }

  function isFiniteNumber(value) {
    return value !== null && value !== '' && isFinite(Number(value));
  }

  function isNonNegativeFiniteMoney(value) {
    return isFiniteNumber(value) && Number(value) >= 0;
  }

  function serviceFeeStandardAmount(record) {
    record = valueOrEmpty(record);
    if (record.standardFee != null) return record.standardFee;
    if (record.standardAmount != null) return record.standardAmount;
    if (record.amount != null) return record.amount;
    return null;
  }

  function isTrialEnabled(record) {
    record = valueOrEmpty(record);
    return record.trialEnabled === true || record.promotionEnabled === true || String(record.activePromotion || '') === 'free_trial';
  }

  function serviceFeeEffectiveAmount(record) {
    record = valueOrEmpty(record);
    if (record.effectiveFee != null) return record.effectiveFee;
    if (record.effectiveAmount != null) return record.effectiveAmount;
    if (record.trialEffectiveFee != null) return record.trialEffectiveFee;
    if (record.trialEffectiveAmount != null) return record.trialEffectiveAmount;
    return isTrialEnabled(record) ? 0 : serviceFeeStandardAmount(record);
  }

  function isCarAlias(value) {
    return /^car[1-4]$/.test(String(value || '').trim());
  }

  function isCar5Alias(value) {
    return String(value || '').trim() === 'car5';
  }

  function hasOwnerApproval(record) {
    record = valueOrEmpty(record);
    return record.ownerApproved === true || record.ownerApproval === true || !!record.ownerApprovalId || !!record.ownerApprovedAt;
  }

  function isInactiveOrProvisional(record) {
    var status = String(valueOrEmpty(record).status || valueOrEmpty(record).serviceStatus || '').toLowerCase();
    return status === 'inactive' || status === 'provisional';
  }

  function hasSensitiveCredentialField(record) {
    var found = false;
    function scan(value) {
      if (found || !value || typeof value !== 'object') return;
      Object.keys(value).forEach(function(key) {
        if (/password|passcode|pin|otp|secret|token/i.test(key)) found = true;
        scan(value[key]);
      });
    }
    scan(record);
    return found;
  }

  function hasOperationalOrPrivateField(record) {
    var found = '';
    function scan(value, path) {
      if (found || !value || typeof value !== 'object') return;
      Object.keys(value).forEach(function(key) {
        var next = path ? path + '.' + key : key;
        if (/booking|passenger|ticket|checkin|checkIn|driverLog|notification|lineLog|liveVehicle|gps/i.test(key)) found = next;
        scan(value[key], next);
      });
    }
    scan(record, '');
    return found;
  }

  function idFieldValue(record, config) {
    record = valueOrEmpty(record);
    var fields = [config.idField].concat(config.alternateIdFields || []);
    for (var i = 0; i < fields.length; i++) {
      if (record[fields[i]] != null && record[fields[i]] !== '') return String(record[fields[i]]);
    }
    return '';
  }

  function scanMasterDataMap(root, entityType, config, blockers, warnings) {
    var map = valueOrEmpty(readPath(root, config.path));
    Object.keys(map).forEach(function(key) {
      var record = valueOrEmpty(map[key]);
      var path = config.path + '/' + key;
      var recordId = idFieldValue(record, config);
      var status = String(record.status || record.lifecycleStatus || '').trim();
      if (!recordId) blockers.push({ level: 'blocker', code: 'missing-stable-id', path: path, entityType: entityType, field: config.idField, message: 'Master data records require stable immutable IDs independent from editable display names.' });
      if (recordId && recordId !== key) blockers.push({ level: 'blocker', code: 'stable-id-key-mismatch', path: path, entityType: entityType, field: config.idField, value: recordId, message: 'Master data map key must match the stable ID field.' });
      if (record.idChanged === true || record.previousId || record.newId || record.renameToId) blockers.push({ level: 'blocker', code: 'stable-id-rewrite-request', path: path, entityType: entityType, message: 'Admin master-data changes must not rewrite stable IDs.' });
      if (status && VALID_MASTER_STATUS.indexOf(status) === -1) warnings.push({ level: 'warning', code: 'unknown-master-status', path: path, entityType: entityType, value: status });
      if ((status === 'test' || record.environmentStatus === 'test') && record.productionReady === true) blockers.push({ level: 'blocker', code: 'test-identity-marked-production-ready', path: path, entityType: entityType, message: 'Test identities must not be exposed as production-ready.' });
      if (entityType === 'serviceFee' && (record.fareAmount != null || record.baseFare != null || record.originStopKey != null || record.destStopKey != null)) blockers.push({ level: 'blocker', code: 'fare-mixed-with-service-fee', path: path, message: 'Fare configuration must stay separate from service fee configuration.' });
      if (entityType === 'serviceFee') {
        var standardAmount = serviceFeeStandardAmount(record);
        var effectiveAmount = serviceFeeEffectiveAmount(record);
        var appliesTo = String(record.appliesTo || record.appliesToServiceGroups || '');
        if (record.currency && String(record.currency) !== SERVICE_FEE_POLICY.currency) blockers.push({ level: 'blocker', code: 'service-fee-currency-not-thb', path: path, message: 'Standard platform service fee must be THB.' });
        if (standardAmount == null || !isNonNegativeFiniteMoney(standardAmount)) blockers.push({ level: 'blocker', code: 'invalid-standard-service-fee', path: path, message: 'standardFee must be a finite number >= 0.' });
        if (effectiveAmount == null || !isNonNegativeFiniteMoney(effectiveAmount)) blockers.push({ level: 'blocker', code: 'invalid-effective-service-fee', path: path, message: 'effectiveFee must be derived as a finite number >= 0.' });
        if (isTrialEnabled(record) && isNonNegativeFiniteMoney(effectiveAmount) && Number(effectiveAmount) !== 0) blockers.push({ level: 'blocker', code: 'trial-effective-service-fee-not-zero', path: path, message: 'Current free-trial effective fee must be THB 0.' });
        if (!isTrialEnabled(record) && isNonNegativeFiniteMoney(standardAmount) && isNonNegativeFiniteMoney(effectiveAmount) && Number(effectiveAmount) !== Number(standardAmount)) blockers.push({ level: 'blocker', code: 'effective-fee-not-derived-from-standard-fee', path: path, message: 'When free trial is off, effectiveFee must follow configured standardFee.' });
        if (appliesTo && appliesTo !== SERVICE_FEE_POLICY.appliesTo && appliesTo !== 'all') blockers.push({ level: 'blocker', code: 'service-fee-not-all-groups', path: path, message: 'Platform service fee applies to every service group, including train.' });
        if (record.includesExternalPayGroups === false || record.includeTrain === false) blockers.push({ level: 'blocker', code: 'service-fee-excludes-train', path: path, message: 'Platform service fee must apply to train/external_pay service groups too.' });
      }
      if (entityType === 'vehicle') {
        var aliases = Array.isArray(record.legacyAliases) ? record.legacyAliases.map(String) : Array.isArray(record.aliases) ? record.aliases.map(String) : [];
        if (isCarAlias(key) || isCar5Alias(key) || isCarAlias(record.vehicleId) || isCar5Alias(record.vehicleId)) blockers.push({ level: 'blocker', code: 'legacy-alias-used-as-vehicle-id', path: path, message: 'veh_001-style vehicleId must be separate from car1-car5 legacy aliases.' });
        if ((key === 'veh_005' || aliases.indexOf('car5') !== -1) && record.liveTrackingAvailable !== false) warnings.push({ level: 'warning', code: 'veh-005-live-tracking-should-be-false', path: path, message: 'veh_005/car5 bridge should explicitly support liveTrackingAvailable=false unless owner activates it later.' });
        if ((aliases.indexOf('car5') !== -1 || key === 'veh_005') && record.productionReady === true && (!record.registrationNo || !record.loginIndexReady)) blockers.push({ level: 'blocker', code: 'veh-005-production-ready-without-login-data', path: path, message: 'veh_005 must remain productionReady=false until real registration and login data exist.' });
      }
      if (entityType === 'settlementRecipient' && /bank|account|promptpay|taxId|nationalId/i.test(JSON.stringify(record))) blockers.push({ level: 'blocker', code: 'financial-identity-not-allowed-in-batch-1', path: path, message: 'Batch 1 must not create real-looking personal or financial settlement data.' });
      var operationalField = hasOperationalOrPrivateField(record);
      if (operationalField) blockers.push({ level: 'blocker', code: 'operational-field-in-master-data', path: path, field: operationalField, message: 'Master data must not contain booking/passenger/ticket/check-in/GPS/notification operational data.' });
    });
  }

  function scanMasterData(root, blockers, warnings) {
    Object.keys(MASTER_DATA_ENTITIES).forEach(function(entityType) {
      scanMasterDataMap(root, entityType, MASTER_DATA_ENTITIES[entityType], blockers, warnings);
    });
    var fares = valueOrEmpty(readPath(root, PATHS.fares));
    Object.keys(fares).forEach(function(originKey) {
      Object.keys(valueOrEmpty(fares[originKey])).forEach(function(destKey) {
        var fare = valueOrEmpty(fares[originKey][destKey]);
        if (fare.serviceFee != null || fare.serviceFeeAmount != null || fare.platformFee != null) {
          blockers.push({ level: 'blocker', code: 'service-fee-mixed-with-fare', path: PATHS.fares + '/' + originKey + '/' + destKey, message: 'Service fee configuration must be separate from fare configuration.' });
        }
        if (isTrainGroup005(PATHS.fares + '/' + originKey + '/' + destKey, fare)) {
          if (paymentOwnershipOf(fare) !== 'external_pay') blockers.push({ level: 'blocker', code: 'train-fare-must-be-external-pay', path: PATHS.fares + '/' + originKey + '/' + destKey, message: 'Train fare must remain external_pay.' });
          if (Number(fare.platformFareAmount || fare.collectedAmount || fare.amount || 0) !== 0) blockers.push({ level: 'blocker', code: 'train-platform-fare-not-zero', path: PATHS.fares + '/' + originKey + '/' + destKey, message: 'Train platform fare collected by SL-Transit must be 0.' });
        }
      });
    });
  }

  function isValidLatitude(value) {
    var n = Number(value);
    return isFiniteNumber(value) && n >= -90 && n <= 90;
  }

  function isValidLongitude(value) {
    var n = Number(value);
    return isFiniteNumber(value) && n >= -180 && n <= 180;
  }

  function scanLiveVehicleRecords(root, issues) {
    var liveVehicles = valueOrEmpty(readPath(root, PATHS.operationsLiveVehicles));
    var vehicles = valueOrEmpty(readPath(root, PATHS.fleetVehicles));
    var queues = valueOrEmpty(readPath(root, PATHS.fleetQueues));
    var trips = valueOrEmpty(readPath(root, PATHS.catalogTrips));

    Object.keys(liveVehicles).forEach(function(key) {
      var live = valueOrEmpty(liveVehicles[key]);
      var path = PATHS.operationsLiveVehicles + '/' + key;
      if (live.lat != null && !isValidLatitude(live.lat)) addValidationIssue(issues, path, 'lat', 'invalid-latitude', live.lat);
      if (live.lng != null && !isValidLongitude(live.lng)) addValidationIssue(issues, path, 'lng', 'invalid-longitude', live.lng);
      if (live.speed != null && !isFiniteNumber(live.speed)) addValidationIssue(issues, path, 'speed', 'invalid-number', live.speed);
      if (live.heading != null && (!isFiniteNumber(live.heading) || Number(live.heading) < 0 || Number(live.heading) > 360)) addValidationIssue(issues, path, 'heading', 'invalid-heading', live.heading);
      if (live.serviceStatus && VALID_LIVE_VEHICLE_STATUS.indexOf(String(live.serviceStatus)) === -1) addValidationIssue(issues, path, 'serviceStatus', 'invalid-live-vehicle-status', live.serviceStatus);
      if (live.vehicleId && !hasRecord(vehicles, live.vehicleId)) addReferenceIssue(issues, path, 'vehicleId', PATHS.fleetVehicles, live.vehicleId);
      if (live.queueId && !hasRecord(queues, live.queueId)) addReferenceIssue(issues, path, 'queueId', PATHS.fleetQueues, live.queueId);
      if (live.currentTripId && !hasRecord(trips, live.currentTripId)) addReferenceIssue(issues, path, 'currentTripId', PATHS.catalogTrips, live.currentTripId);
    });
  }

  function scanReferences(root, issues) {
    var stops = valueOrEmpty(readPath(root, PATHS.catalogStops));
    var routes = valueOrEmpty(readPath(root, PATHS.catalogRoutes));
    var trips = valueOrEmpty(readPath(root, PATHS.catalogTrips));
    var fares = valueOrEmpty(readPath(root, PATHS.catalogFares));
    var vehicles = valueOrEmpty(readPath(root, PATHS.fleetVehicles));
    var queues = valueOrEmpty(readPath(root, PATHS.fleetQueues));
    var queueOwners = valueOrEmpty(readPath(root, PATHS.fleetQueueOwners));

    Object.keys(routes).forEach(function(key) {
      var route = valueOrEmpty(routes[key]);
      if (route.fromStopKey && !hasRecord(stops, route.fromStopKey)) addReferenceIssue(issues, PATHS.catalogRoutes + '/' + key, 'fromStopKey', PATHS.catalogStops, route.fromStopKey);
      if (route.toStopKey && !hasRecord(stops, route.toStopKey)) addReferenceIssue(issues, PATHS.catalogRoutes + '/' + key, 'toStopKey', PATHS.catalogStops, route.toStopKey);
    });

    Object.keys(trips).forEach(function(key) {
      var trip = valueOrEmpty(trips[key]);
      if (trip.routeId && !hasRecord(routes, trip.routeId)) addReferenceIssue(issues, PATHS.catalogTrips + '/' + key, 'routeId', PATHS.catalogRoutes, trip.routeId);
      if (trip.vehicleId && !hasRecord(vehicles, trip.vehicleId)) addReferenceIssue(issues, PATHS.catalogTrips + '/' + key, 'vehicleId', PATHS.fleetVehicles, trip.vehicleId);
      (Array.isArray(trip.stopTimes) ? trip.stopTimes : []).forEach(function(stopTime, index) {
        var stopKey = valueOrEmpty(stopTime).stopKey;
        if (stopKey && !hasRecord(stops, stopKey)) addReferenceIssue(issues, PATHS.catalogTrips + '/' + key + '/stopTimes/' + index, 'stopKey', PATHS.catalogStops, stopKey);
      });
    });

    Object.keys(fares).forEach(function(originKey) {
      if (!hasRecord(stops, originKey)) addReferenceIssue(issues, PATHS.catalogFares + '/' + originKey, 'originKey', PATHS.catalogStops, originKey);
      Object.keys(valueOrEmpty(fares[originKey])).forEach(function(destKey) {
        if (!hasRecord(stops, destKey)) addReferenceIssue(issues, PATHS.catalogFares + '/' + originKey + '/' + destKey, 'destKey', PATHS.catalogStops, destKey);
      });
    });

    Object.keys(vehicles).forEach(function(key) {
      var vehicle = valueOrEmpty(vehicles[key]);
      if (vehicle.queueId && !hasRecord(queues, vehicle.queueId)) addReferenceIssue(issues, PATHS.fleetVehicles + '/' + key, 'queueId', PATHS.fleetQueues, vehicle.queueId);
    });

    Object.keys(queues).forEach(function(key) {
      var queue = valueOrEmpty(queues[key]);
      if (queue.vehicleId && !hasRecord(vehicles, queue.vehicleId)) addReferenceIssue(issues, PATHS.fleetQueues + '/' + key, 'vehicleId', PATHS.fleetVehicles, queue.vehicleId);
      if (queue.ownerId && !hasRecord(queueOwners, queue.ownerId)) addReferenceIssue(issues, PATHS.fleetQueues + '/' + key, 'ownerId', PATHS.fleetQueueOwners, queue.ownerId);
    });
  }

  function scanBlockedImportTargets(root, blockers) {
    LEGACY_SOURCE_PATHS.concat(RUNTIME_CONTRACT_PATHS, PRIVATE_RUNTIME_PATHS).forEach(function(path) {
      var value = readPath(root, path);
      if (value && typeof value === 'object' && Object.keys(value).length) {
        blockers.push({
          level: 'blocker',
          code: startsWithPath(path, 'operations') ? 'runtime-path-not-seed-target' : 'blocked-import-target',
          path: path,
          message: 'Seed/import snapshots may only target data/erpDataCenter/*; legacy, private, and runtime paths are source/contract-only.'
        });
      }
    });
    walkSnapshotPaths(root, '', function(path) {
      if (isForbiddenErpOperationsPath(path)) {
        blockers.push({
          level: 'blocker',
          code: 'forbidden-erp-operations-subtree',
          path: path,
          message: 'Runtime/private operations subtrees must not be nested under data/erpDataCenter.'
        });
        return;
      }
      var forbiddenName = forbiddenErpDescendantName(path);
      if (forbiddenName) {
        blockers.push({
          level: 'blocker',
          code: 'forbidden-erp-descendant-name',
          path: path,
          name: forbiddenName,
          message: 'Forbidden private/runtime descendant name under data/erpDataCenter: ' + forbiddenName + '.'
        });
      }
    });
  }

  function scanFleetRules(root, blockers, warnings) {
    var vehicles = valueOrEmpty(readPath(root, PATHS.fleetVehicles));
    var loginIndex = valueOrEmpty(readPath(root, PATHS.fleetVehicleLoginIndex));
    var registrationSeen = {};

    Object.keys(vehicles).forEach(function(key) {
      var vehicle = valueOrEmpty(vehicles[key]);
      var path = PATHS.fleetVehicles + '/' + key;
      var aliases = Array.isArray(vehicle.aliases) ? vehicle.aliases.map(String) : [];
      if (isCarAlias(key) || isCarAlias(vehicle.vehicleId)) {
        blockers.push({ level: 'blocker', code: 'car-alias-used-as-master-key', path: path, message: 'car1-car4 are aliases only; vehicle master data must use canonical vehicleId keys.' });
      }
      if (isCar5Alias(key) || isCar5Alias(vehicle.vehicleId) || aliases.some(isCar5Alias)) {
        if (vehicle.productionReady === true && (!vehicle.registrationNo || !vehicle.loginIndexReady)) {
          blockers.push({ level: 'blocker', code: 'veh-005-production-ready-without-login-data', path: path, message: 'veh_005/car5 must remain productionReady=false until real registration and login data exist.' });
        }
      }
      if (hasSensitiveCredentialField(vehicle)) {
        blockers.push({ level: 'blocker', code: 'plaintext-credential-field', path: path, message: 'Vehicle/fleet master data must not contain plaintext password, pin, otp, secret, or token fields.' });
      }
      if (vehicle.vehicleId == null || vehicle.vehicleId === '') {
        blockers.push({ level: 'blocker', code: 'missing-vehicle-id', path: path, message: 'vehicleId is required for every vehicle record.' });
      }
      var registration = String(vehicle.registrationNo || '').trim();
      if (registration && Object.keys(loginIndex).length) {
        if (registrationSeen[registration]) {
          blockers.push({ level: 'blocker', code: 'duplicate-registration-no', path: path, registrationNo: registration, message: 'registrationNo must be unique when vehicle login index is present.' });
        }
        registrationSeen[registration] = true;
      }
    });
    Object.keys(loginIndex).forEach(function(key) {
      if (hasSensitiveCredentialField(loginIndex[key])) {
        blockers.push({ level: 'blocker', code: 'plaintext-login-credential-field', path: PATHS.fleetVehicleLoginIndex + '/' + key, message: 'Vehicle login index must not contain plaintext password, pin, otp, secret, or token fields.' });
      }
    });
  }

  function paymentOwnershipOf(record) {
    record = valueOrEmpty(record);
    return String(record.paymentOwnership || record.paymentOwner || '').trim();
  }

  function providerIdOf(record) {
    record = valueOrEmpty(record);
    return String(record.providerId || record.provider || record.operatorId || '').trim();
  }

  function isProviderOwned(owner) {
    return owner && owner !== 'sl_transit' && owner !== 'sl-transit' && owner !== 'internal';
  }

  function isTrainGroup005(path, fare) {
    fare = valueOrEmpty(fare);
    var text = [path, fare.groupId, fare.groupKey, fare.routeId, fare.routeKey, fare.serviceType, fare.providerId, fare.provider, fare.destinationKey, fare.toStopKey].join(' ').toLowerCase();
    return text.indexOf('group_005') !== -1 || text.indexOf('train') !== -1;
  }

  function scanFarePaymentRules(root, blockers) {
    var fares = valueOrEmpty(readPath(root, PATHS.catalogFares));
    var fareSegments = valueOrEmpty(readPath(root, PATHS.catalogFareSegments));
    var providerRegistry = valueOrEmpty(readPath(root, PATHS.providerRegistry));
    var hasProviderOwnedFare = false;

    function scanFareMap(map, basePath, type) {
      Object.keys(map).forEach(function(key) {
        var item = valueOrEmpty(map[key]);
        var path = basePath + '/' + key;
        var owner = paymentOwnershipOf(item);
        if (!owner) {
          blockers.push({ level: 'blocker', code: 'missing-payment-ownership', path: path, type: type, message: 'paymentOwnership is required for fares and fareSegments.' });
        }
        if (isProviderOwned(owner)) hasProviderOwnedFare = true;
        if (isTrainGroup005(path, item) && owner !== 'external_pay') {
          blockers.push({ level: 'blocker', code: 'group-005-train-must-be-external-pay', path: path, message: 'group_005/train fares must be external_pay.' });
        }
      });
    }

    Object.keys(fares).forEach(function(originKey) {
      var nested = valueOrEmpty(fares[originKey]);
      var nestedKeys = Object.keys(nested);
      if (nestedKeys.some(function(k) { return typeof nested[k] === 'object'; })) {
        nestedKeys.forEach(function(destKey) {
          scanFareMap((function() { var o = {}; o[originKey + '/' + destKey] = nested[destKey]; return o; })(), PATHS.catalogFares, 'fare');
        });
      } else {
        scanFareMap((function() { var o = {}; o[originKey] = nested; return o; })(), PATHS.catalogFares, 'fare');
      }
    });
    scanFareMap(fareSegments, PATHS.catalogFareSegments, 'fareSegment');

    if (hasProviderOwnedFare && !Object.keys(providerRegistry).length) {
      blockers.push({ level: 'blocker', code: 'missing-provider-registry', path: PATHS.providerRegistry, message: 'Provider registry is required before provider-owned fares can be apply-ready.' });
    }
  }

  function validateSnapshot(snapshot) {
    var root = valueOrEmpty(snapshot);
    var missingCollections = REQUIRED_COLLECTIONS.filter(function(path) { return !hasCollection(root, path); });
    var warnings = [];
    var blockers = [];

    missingCollections.forEach(function(path) {
      blockers.push({ level: 'blocker', code: 'missing-required-collection', path: path });
    });

    scanBlockedImportTargets(root, blockers);
    scanMap(root, PATHS.catalogStops, 'stop', warnings);
    scanMap(root, PATHS.catalogRoutes, 'route', warnings);
    scanMap(root, PATHS.catalogTrips, 'trip', warnings);
    scanMap(root, PATHS.fleetVehicles, 'vehicle', warnings);
    scanMap(root, PATHS.fleetQueues, 'queue', warnings);
    scanReferences(root, warnings);
    scanLiveVehicleRecords(root, warnings);
    scanFleetRules(root, blockers, warnings);
    scanFarePaymentRules(root, blockers);
    scanMasterData(root, blockers, warnings);
    var readinessGate = {
      dryRun: true,
      readyForBackboneReview: blockers.length === 0,
      readyForSwitch: false,
      blockers: blockers.slice(),
      warnings: warnings.slice(),
      requiredNextChecks: [
        'erp-data-center-dry-run-approved',
        'feature-bridge-parity-verified',
        'github-actions-pages-live-verified',
        'private-runtime-paths-blocked',
        'readyForApply-owner-approval-required'
      ]
    };
    return {
      dryRun: true,
      schemaVersion: SCHEMA_VERSION,
      readyForBackboneReview: blockers.length === 0,
      readyForSwitch: false,
      readinessGate: readinessGate,
      requiredCollections: REQUIRED_COLLECTIONS.slice(),
      optionalCollections: OPTIONAL_COLLECTIONS.slice(),
      missingCollections: missingCollections,
      blockers: blockers,
      warnings: warnings
    };
  }

  function buildSeedSkeleton() {
    return {
      dryRun: true,
      schemaVersion: SCHEMA_VERSION,
      data: {
        erpDataCenter: {
          settings: {},
          destinations: {},
          stops: {},
          boardingPoints: {},
          terminals: {},
          providers: {},
          serviceGroups: {},
          routes: {},
          routeStopSequences: {},
          trips: {},
          stopTimes: {},
          fares: {},
          fareSegments: {},
          transferRules: {},
          paymentOwnership: {},
          temporaryClosures: {},
          serviceFees: {},
          settlementRecipients: {},
          catalog: {
            stops: {},
            groups: {},
            routes: {},
            trips: {},
            fares: {},
            fareSegments: {},
            services: {},
            stopTimes: {},
            capacities: {},
            closures: {}
          },
          fleet: {
            vehicles: {},
            queues: {},
            assignmentRules: {},
            drivers: {},
            queueOwners: {},
            vehicleLoginIndex: {}
          },
          finance: {
            transactions: {}
          },
          providerRegistry: {}
          ,
          meta: {
            versions: {},
            audit: {}
          }
        }
      }
    };
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    PATHS: Object.assign({}, PATHS),
    REQUIRED_COLLECTIONS: REQUIRED_COLLECTIONS.slice(),
    OPTIONAL_COLLECTIONS: OPTIONAL_COLLECTIONS.slice(),
    LEGACY_SOURCE_PATHS: LEGACY_SOURCE_PATHS.slice(),
    RUNTIME_CONTRACT_PATHS: RUNTIME_CONTRACT_PATHS.slice(),
    PRIVATE_RUNTIME_PATHS: PRIVATE_RUNTIME_PATHS.slice(),
    FORBIDDEN_ERP_DESCENDANT_NAMES: FORBIDDEN_ERP_DESCENDANT_NAMES.slice(),
    FORBIDDEN_ERP_OPERATIONS_SUBTREES: FORBIDDEN_ERP_OPERATIONS_SUBTREES.slice(),
    RECORD_REQUIREMENTS: Object.assign({}, RECORD_REQUIREMENTS),
    MASTER_DATA_ENTITIES: JSON.parse(JSON.stringify(MASTER_DATA_ENTITIES)),
    VALID_MASTER_STATUS: VALID_MASTER_STATUS.slice(),
    SERVICE_FEE_POLICY: Object.assign({}, SERVICE_FEE_POLICY),
    scanReferences: scanReferences,
    scanMasterData: scanMasterData,
    pathOf: pathOf,
    readPath: readPath,
    validateSnapshot: validateSnapshot,
    buildSeedSkeleton: buildSeedSkeleton
  };

  global.SLTransitSchema = api;
  global.SLTransit = global.SLTransit || {};
  global.SLTransit.schema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
