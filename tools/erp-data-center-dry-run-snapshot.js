#!/usr/bin/env node
'use strict';

const https = require('https');
const schema = require('../erp-schema.js');
const stableIdAuthority = require('./erp-stable-id-registry.js');
require('../erp-import-plan.js');

const FIREBASE_BASE = 'https://bus-booking-1d68c-default-rtdb.firebaseio.com';
const STARTING_SHA = '98f2b6f6e05b07a60b89c247e7d57b2edf6a7caf';
const TARGET_COUNTS = {
  destinations: 49,
  networkNodes: 49,
  stops: 15,
  boardingPoints: 15,
  terminals: 0,
  providers: 0,
  serviceGroups: 5,
  serviceGroupAliases: 5,
  groupStops: 15,
  routes: 244,
  routeSequenceVersions: 6,
  tripSequenceAssignments: 14,
  scheduleOffers: 820,
  stopTimes: 94,
  fares: 720,
  fareSegments: 244,
  transferRules: 322,
  paymentOwnership: 2,
  serviceFees: 1,
  temporaryClosures: 5,
  vehicles: 5,
  queues: 5,
  queueScheduleVersions: 5,
  queueTrips: 14,
  assignmentRules: 2,
  drivers: 0,
  vehicleLoginIndex: 0,
  settlementRecipients: 0,
  stableIdRegistryEntries: 118,
  metaVersions: 1,
  metaAudit: 1
};

const LABEL_KEY_OVERRIDES = new Map([
  ['ฉะเชิงเทรา (แปดริ้ว)', 'chachoengsao'],
  ['ฉะเชิงเทรา', 'chachoengsao'],
  ['แปดริ้ว', 'chachoengsao'],
  ['ท่ารถสนามชัยเขต', 'sanamchaikhet'],
  ['สนามชัยเขต', 'sanamchaikhet'],
  ['คลองหาด', 'klonghat'],
  ['คลองหา���', 'klonghat'],
  ['พนมสารคาม', 'phanom'],
  ['กม.1', 'km_1'],
  ['กม.7', 'km_7'],
  ['กม.10', 'km_10'],
  ['ห้วยโสม', 'huaisom'],
  ['ท่าตะเกียบ', 'tatakiab'],
  ['หนองคอก', 'nongkhok'],
  ['คลองตะเคียน', 'khlongtakien'],
  ['หนองเรือ', 'nongruea'],
  ['ไพรจิต', 'phaijit'],
  ['ทุ่งกบินทร์', 'thoengkabintr'],
  ['สี่แยกโคนม', 'siyaekkhonom'],
  ['วังน้ำเย็น', 'wangnamyen'],
  ['หมอชิต', 'mochit'],
  ['เอกมัย', 'ekkamai'],
  ['BTS จตุจักร', 'bts_chatuchak'],
  ['BTS อ่อนนุช', 'bts_onnut'],
  ['BTS พระโขนง', 'bts_phrakanong'],
  ['บางนา', 'bangna'],
  ['ม.เกษตร', 'kasetsart'],
  ['รังสิต', 'rangsit'],
  ['ตลาดมีนบุรี', 'minburi_market'],
  ['โฮมโปร', 'homepro'],
  ['บางแสน', 'bangsaen'],
  ['ตลาดหนองมน', 'nongmon_market'],
  ['ศรีราชา', 'sriracha'],
  ['อ่าวอุดม', 'ao_udom'],
  ['แหลมฉบัง', 'laem_chabang'],
  ['พัทยา', 'pattaya'],
  ['สัตหีบ', 'sattahip'],
  ['BTS บางฉาง', 'bts_bang_chang'],
  ['แยกลาดพราว', 'yak_ladprao'],
  ['แยกลาดพร้าว', 'yak_ladprao'],
  ['แยกอัยการ', 'yak_aiyakan'],
  ['บ้านฉาง', 'ban_chang'],
  ['ระยอง', 'rayong'],
  ['หัวตะเข้', 'hua_takhe'],
  ['พระจอมเกล้า', 'phra_chom_klao'],
  ['ลาดกระบัง', 'lat_krabang'],
  ['บ้านทับช้าง', 'ban_thap_chang'],
  ['หัวหมาก', 'hua_mak'],
  ['คลองตัน', 'khlong_tan'],
  ['อโศก', 'asok'],
  ['มักกะสัน', 'makkasan'],
  ['พญาไท', 'phaya_thai'],
  ['อุรุพงษ์', 'uruphong'],
  ['กรุงเทพ (หัวลำโพง)', 'bangkok_hua_lamphong']
]);

const DISPLAY_LABEL_FIXES = new Map([
  ['คลองหา���', 'คลองหาด'],
  ['ห้วยส้ม', 'ห้วยโสม']
]);

const PRIMARY_STOP_KEYS = new Set(['chachoengsao', 'sanamchaikhet', 'klonghat']);
const TRAIN_GROUP_ID = 'group_005';
const REVIEW_ONLY_ROUTE_IDS = new Set(Array.from({ length: 11 }, (_, index) => `ROUTE-MAIN-${211 + index}`));
const ROUTE_KEY_MAP = {
  sanamchai_to_chachoengsao: 'ROUTE-MAIN-004',
  chachoengsao_to_sanamchai: 'ROUTE-MAIN-003',
  chachoengsao_to_klonghat: 'ROUTE-MAIN-021',
  klonghat_to_chachoengsao: 'ROUTE-MAIN-022'
};
const INTERMEDIATE_TRIP_021_1400_TIMES = new Set(['15:10', '15:15', '15:20', '15:30']);
const GROUP_ALIASES = Object.freeze({
  main: 'group_001',
  bangkok: 'group_002',
  coastal: 'group_003',
  group_004: 'group_004',
  group_005: 'group_005'
});
const LEGACY_CANONICAL_GROUP_IDS = new Set(['main', 'bangkok', 'coastal']);
const EXPECTED_MAPPING_STATUS_BY_GROUP = Object.freeze({
  group_001: Object.freeze({ mapped_queue_trip: 353, estimated_schedule: 73, departure_only: 0, external_schedule: 0, needs_review: 0 }),
  group_002: Object.freeze({ mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 47, external_schedule: 0, needs_review: 0 }),
  group_003: Object.freeze({ mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 207, external_schedule: 0, needs_review: 0 }),
  group_004: Object.freeze({ mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 8, external_schedule: 0, needs_review: 0 }),
  group_005: Object.freeze({ mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 0, external_schedule: 132, needs_review: 0 })
});
const ESTIMATED_TIME_DISCLAIMER_KEY = 'estimated_travel_time_may_change';
const ESTIMATED_TIME_DISCLAIMER_TH = 'เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง';
const EXPECTED_STOP_TIME_ROLES = Object.freeze({
  scheduled_origin_departure: 14,
  estimated_pass_through: 66,
  estimated_arrival: 14
});
const CORRIDOR = Object.freeze([
  { code: 'g01p001', stopKey: 'chachoengsao', displayNameTh: 'ฉะเชิงเทรา', aliases: ['แปดริ้ว'] },
  { code: 'g01p002', stopKey: 'phanom', displayNameTh: 'พนมสารคาม', aliases: [] },
  { code: 'g01p003', stopKey: 'sanamchaikhet', displayNameTh: 'สนามชัยเขต', aliases: ['sanamchai'] },
  { code: 'g01p004', stopKey: 'km_1', displayNameTh: 'กม.1', aliases: [] },
  { code: 'g01p005', stopKey: 'km_7', displayNameTh: 'กม.7', aliases: [] },
  { code: 'g01p006', stopKey: 'huaisom', displayNameTh: 'ห้วยโสม', aliases: [] },
  { code: 'g01p007', stopKey: 'tatakiab', displayNameTh: 'ท่าตะเกียบ', aliases: [] },
  { code: 'g01p008', stopKey: 'nongkhok', displayNameTh: 'หนองคอก', aliases: [] },
  { code: 'g01p009', stopKey: 'khlongtakien', displayNameTh: 'คลองตะเคียน', aliases: [] },
  { code: 'g01p010', stopKey: 'nongruea', displayNameTh: 'หนองเรือ', aliases: [] },
  { code: 'g01p011', stopKey: 'phaijit', displayNameTh: 'ไพรจิต', aliases: [] },
  { code: 'g01p012', stopKey: 'thoengkabintr', displayNameTh: 'ทุ่งกบินทร์', aliases: [] },
  { code: 'g01p013', stopKey: 'siyaekkhonom', displayNameTh: 'สี่แยกโคนม', aliases: [] },
  { code: 'g01p014', stopKey: 'wangnamyen', displayNameTh: 'วังน้ำเย็น', aliases: [] },
  { code: 'g01p015', stopKey: 'klonghat', displayNameTh: 'คลองหาด', aliases: ['khlonghat'] }
]);
const CORRIDOR_BY_STOP_KEY = new Map(CORRIDOR.map((entry) => [entry.stopKey, entry]));
const ROUTE_SEQUENCE_DEFINITIONS = Object.freeze({
  rsv_000001: ['g01p003', 'g01p002', 'g01p001'],
  rsv_000002: CORRIDOR.map((entry) => entry.code),
  rsv_000003: CORRIDOR.map((entry) => entry.code).reverse(),
  rsv_000004: ['g01p001', 'g01p002', 'g01p003'],
  rsv_000005: ['g01p008', 'g01p007', 'g01p003', 'g01p002', 'g01p001'],
  rsv_000006: ['g01p001', 'g01p002', 'g01p003', 'g01p007', 'g01p008']
});
const ACTIVE_QUEUE_TRIPS = Object.freeze([
  { queueTripId: 'qt_000001', tripSequenceAssignmentId: 'tsa_000001', queueId: 'queue_001', sourceQueue: 1, sourceTrip: 1, routeId: 'ROUTE-MAIN-004', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-004-0900', sequenceId: 'rsv_000001' },
  { queueTripId: 'qt_000002', tripSequenceAssignmentId: 'tsa_000002', queueId: 'queue_001', sourceQueue: 1, sourceTrip: 2, routeId: 'ROUTE-MAIN-021', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-021-1120', sequenceId: 'rsv_000002' },
  { queueTripId: 'qt_000003', tripSequenceAssignmentId: 'tsa_000003', queueId: 'queue_002', sourceQueue: 2, sourceTrip: 1, routeId: 'ROUTE-MAIN-022', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-022-0800', sequenceId: 'rsv_000003' },
  { queueTripId: 'qt_000004', tripSequenceAssignmentId: 'tsa_000004', queueId: 'queue_002', sourceQueue: 2, sourceTrip: 2, routeId: 'ROUTE-MAIN-003', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-003-1220', sequenceId: 'rsv_000004' },
  { queueTripId: 'qt_000005', tripSequenceAssignmentId: 'tsa_000005', queueId: 'queue_002', sourceQueue: 2, sourceTrip: 3, routeId: 'ROUTE-MAIN-004', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-004-1340', sequenceId: 'rsv_000001' },
  { queueTripId: 'qt_000006', tripSequenceAssignmentId: 'tsa_000006', queueId: 'queue_002', sourceQueue: 2, sourceTrip: 4, routeId: 'ROUTE-MAIN-003', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-003-1520', sequenceId: 'rsv_000004' },
  { queueTripId: 'qt_000007', tripSequenceAssignmentId: 'tsa_000007', queueId: 'queue_003', sourceQueue: 3, sourceTrip: 1, routeId: 'ROUTE-MAIN-004', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-004-0620', sequenceId: 'rsv_000001' },
  { queueTripId: 'qt_000008', tripSequenceAssignmentId: 'tsa_000008', queueId: 'queue_003', sourceQueue: 3, sourceTrip: 2, routeId: 'ROUTE-MAIN-003', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-003-0940', sequenceId: 'rsv_000004' },
  { queueTripId: 'qt_000009', tripSequenceAssignmentId: 'tsa_000009', queueId: 'queue_003', sourceQueue: 3, sourceTrip: 3, routeId: 'ROUTE-MAIN-004', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-004-1210', sequenceId: 'rsv_000001' },
  { queueTripId: 'qt_000010', tripSequenceAssignmentId: 'tsa_000010', queueId: 'queue_003', sourceQueue: 3, sourceTrip: 4, routeId: 'ROUTE-MAIN-021', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-021-1400', sequenceId: 'rsv_000002' },
  { queueTripId: 'qt_000011', tripSequenceAssignmentId: 'tsa_000011', queueId: 'queue_004', sourceQueue: 4, sourceTrip: 1, routeId: 'ROUTE-MAIN-022', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-022-1130', sequenceId: 'rsv_000003' },
  { queueTripId: 'qt_000012', tripSequenceAssignmentId: 'tsa_000012', queueId: 'queue_004', sourceQueue: 4, sourceTrip: 2, routeId: 'ROUTE-MAIN-003', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-003-1620', sequenceId: 'rsv_000004' },
  { queueTripId: 'qt_000013', tripSequenceAssignmentId: 'tsa_000013', queueId: 'queue_005', routeId: 'ROUTE-MAIN-008_1', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-008_1-0620', sequenceId: 'rsv_000005', ownerApproved: true },
  { queueTripId: 'qt_000014', tripSequenceAssignmentId: 'tsa_000014', queueId: 'queue_005', routeId: 'ROUTE-MAIN-007_1', legacyPublishedTripId: 'TRIP-ROUTE-MAIN-007_1-1720', sequenceId: 'rsv_000006', ownerApproved: true }
]);
const QUEUE_005_STOP_TIMES = Object.freeze({
  'TRIP-ROUTE-MAIN-008_1-0620': ['06:20', '06:35', '07:20', '07:40', '08:20'],
  'TRIP-ROUTE-MAIN-007_1-1720': ['17:20', '18:00', '18:20', '18:50', '19:05']
});
const OWNER_APPROVED_SCHEDULE_OFFER_CORRECTIONS = Object.freeze([
  {
    tripId: 'TRIP-ROUTE-MAIN-011-1720',
    routeId: 'ROUTE-MAIN-011',
    groupId: 'group_001',
    departTime: '17:20',
    sourcePath: 'owner_decisions/queue_005/evening',
    sourceId: 'TRIP-ROUTE-MAIN-007_1-1720:g01p007',
    sourceNotes: 'owner-approved queue_005 evening pass-through schedule offer for Chachoengsao to Tatakiab'
  }
]);
const STABLE_ID_REGISTRY = stableIdAuthority.buildRegistry();

function requestJson(path) {
  return new Promise((resolve, reject) => {
    https.get(`${FIREBASE_BASE}/${path}.json`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GET ${path}.json failed with ${response.statusCode}`));
          return;
        }
        resolve(JSON.parse(body));
      });
    }).on('error', reject);
  });
}

function orderedValues(value) {
  return Object.keys(value || {}).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  }).map((key) => value[key]).filter(Boolean);
}

function cleanLabel(label) {
  const text = String(label || '').trim();
  return DISPLAY_LABEL_FIXES.get(text) || text;
}

function keyForLabel(label) {
  const clean = cleanLabel(label);
  if (LABEL_KEY_OVERRIDES.has(clean)) return LABEL_KEY_OVERRIDES.get(clean);
  return clean
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function stableIdFor(entityType, ownerRef) {
  const stableId = stableIdAuthority.resolveByOwnerRef(STABLE_ID_REGISTRY, entityType, ownerRef);
  if (!stableId) {
    const audit = stableIdAuthority.auditRequests(STABLE_ID_REGISTRY, [{ entityType, ownerRef }]);
    const error = new Error(`Unregistered stable ID owner ${entityType} ${ownerRef}`);
    error.code = 'unregistered_stable_id';
    error.allocationProposal = audit.proposals[0] || null;
    throw error;
  }
  return stableId;
}

function stableIdForLegacyRef(entityType, legacyRef) {
  const stableId = stableIdAuthority.resolveByLegacyRef(STABLE_ID_REGISTRY, entityType, legacyRef);
  if (!stableId) {
    const audit = stableIdAuthority.auditRequests(STABLE_ID_REGISTRY, [{ entityType, legacyRef }]);
    const error = new Error(`Unregistered stable ID legacy reference ${entityType} ${legacyRef}`);
    error.code = 'unregistered_stable_id';
    error.allocationProposal = audit.proposals[0] || null;
    throw error;
  }
  return stableId;
}

function resolveStableIdFromRegistry(registry, entityType, legacyRef) {
  return stableIdAuthority.resolveByLegacyRef(registry, entityType, legacyRef);
}

function registryOwnerRef(stableId) {
  const entry = STABLE_ID_REGISTRY.entries[stableId];
  if (!entry) throw new Error(`Stable ID registry entry missing for ${stableId}`);
  return entry.ownerRef;
}

function buildStableIdRegistry() {
  return stableIdAuthority.buildRegistry();
}

function canonicalGroupId(value) {
  return GROUP_ALIASES[value] || value;
}

function groupIdOf(record) {
  return canonicalGroupId(record.groupId || record.groupKey || record.serviceGroupId || '');
}

function fareAmountOf(publishedCatalog, route) {
  const fare = publishedCatalog.fares && publishedCatalog.fares[route.id] || {};
  const amount = fare.price ?? fare.fare ?? fare.amount ?? route.price ?? (route.legacy && route.legacy.price);
  return Number(amount || 0);
}

function buildLineage(sourcePath, sourceId, notes) {
  return {
    sourceSystem: 'legacy',
    sourcePath,
    sourceId: sourceId || '',
    importedBy: 'erp-data-center-dry-run-snapshot',
    notes: notes || ''
  };
}

function classifyDestination(key) {
  if (PRIMARY_STOP_KEYS.has(key)) return 'primary_stop';
  if (key === 'nongkhok') return 'pass_through';
  return 'network_node';
}

function normalizeStopKey(key) {
  if (key === 'sanamchai') return 'sanamchaikhet';
  if (key === 'khlonghat') return 'klonghat';
  return key;
}

function buildDestinations(routes, stops) {
  const destinations = {};
  routes.forEach((route) => {
    [route.from, route.to].forEach((label) => {
      const displayNameTh = cleanLabel(label);
      const destinationId = keyForLabel(displayNameTh);
      if (!destinationId) return;
      const isSourceProvenMainStop = !!stops[destinationId];
      destinations[destinationId] = destinations[destinationId] || {
        destinationId,
        displayNameTh,
        aliases: destinationId === 'chachoengsao' ? ['แปดริ้ว'] : [],
        classification: classifyDestination(destinationId),
        phaseStatus: isSourceProvenMainStop ? 'origin_enabled' : 'origin_disabled',
        originSelectable: isSourceProvenMainStop,
        destinationSelectable: true,
        destinationPurpose: isSourceProvenMainStop ? ['boarding', 'alighting', 'fare_endpoint'] : ['drop_off', 'transfer', 'fare_endpoint'],
        exactDetailsStatus: isSourceProvenMainStop ? 'source_proven' : 'owner_details_deferred',
        serviceGroupIds: [],
        status: 'active',
        sourceLineage: []
      };
      if (isSourceProvenMainStop) {
        destinations[destinationId].phaseStatus = 'origin_enabled';
        destinations[destinationId].originSelectable = true;
        destinations[destinationId].destinationSelectable = true;
        destinations[destinationId].exactDetailsStatus = 'source_proven';
      }
      const serviceGroupId = groupIdOf(route);
      if (serviceGroupId && destinations[destinationId].serviceGroupIds.indexOf(serviceGroupId) === -1) {
        destinations[destinationId].serviceGroupIds.push(serviceGroupId);
      }
      destinations[destinationId].sourceLineage.push(buildLineage('publishedCatalog/routes', route.id, 'route endpoint label'));
    });
  });
  return destinations;
}

function buildNetworkModel(destinations, stops) {
  const networkNodes = {};
  const groupStops = {};

  Object.keys(destinations).sort().forEach((destinationId) => {
    const destination = destinations[destinationId];
    const nodeId = stableIdAuthority.resolveByLegacyRef(STABLE_ID_REGISTRY, 'networkNode', destinationId);
    if (!nodeId) return;
    const corridorEntry = CORRIDOR_BY_STOP_KEY.get(destinationId);
    networkNodes[nodeId] = {
      nodeId,
      displayNameTh: corridorEntry ? corridorEntry.displayNameTh : destination.displayNameTh,
      aliases: corridorEntry ? corridorEntry.aliases.slice() : destination.aliases.slice(),
      capabilities: {
        originSelectable: destination.originSelectable === true,
        destinationSelectable: destination.destinationSelectable === true,
        transferEligible: destination.destinationPurpose.indexOf('transfer') !== -1,
        fareEndpoint: destination.destinationPurpose.indexOf('fare_endpoint') !== -1
      },
      status: destination.status,
      registryOwnerRef: registryOwnerRef(nodeId),
      sourceLineage: destination.sourceLineage.slice()
    };
    destination.nodeId = nodeId;
    destination.selectionView = true;
    destination.capabilities = Object.assign({}, networkNodes[nodeId].capabilities);

    if (!corridorEntry || !stops[destinationId]) return;
    const groupStopId = stableIdAuthority.resolveByLegacyRef(STABLE_ID_REGISTRY, 'groupStop', destinationId);
    if (!groupStopId) return;
    const groupStopOwnerRef = registryOwnerRef(groupStopId);
    groupStops[groupStopId] = {
      groupStopId,
      groupStopCode: corridorEntry.code,
      serviceGroupId: 'group_001',
      nodeId,
      displayNameTh: corridorEntry.displayNameTh,
      lat: stops[destinationId].lat,
      lng: stops[destinationId].lng,
      aliases: corridorEntry.aliases.slice(),
      corridorPosition: Number(corridorEntry.code.slice(-3)),
      capabilities: {
        originSelectable: true,
        destinationSelectable: true,
        boardingSupported: true,
        alightingSupported: true
      },
      status: 'active',
      registryOwnerRef: groupStopOwnerRef,
      sourceLineage: stops[destinationId].sourceLineage.slice()
    };
    stops[destinationId].nodeId = nodeId;
    stops[destinationId].groupStopId = groupStopId;
    stops[destinationId].groupStopCode = corridorEntry.code;
    stops[destinationId].displayNameTh = corridorEntry.displayNameTh;
    stops[destinationId].nameTh = corridorEntry.displayNameTh;
  });

  return { networkNodes, groupStops };
}

function buildStops(routeData) {
  const stops = {};
  orderedValues(routeData.stops).forEach((stop, index) => {
    const stopKey = normalizeStopKey(stop.stopKey || stop.key || stop.id);
    const displayNameTh = cleanLabel(stop.stopNameTh || stop.nameTh || stop.name || stopKey);
    const lat = Number(stop.lat);
    const lng = Number(stop.lng);
    stops[stopKey] = {
      stopKey,
      nameTh: displayNameTh,
      displayNameTh,
      order: Number(stop.order || index + 1),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      classification: classifyDestination(stopKey),
      status: 'active',
      sourceLineage: [buildLineage(`routeData/stops/${stop.stopKey || stop.key || index}`, stopKey, 'source-proven exact stop')]
    };
  });
  return stops;
}

function buildBoardingPoints(stops) {
  return Object.keys(stops).sort().reduce((map, stopKey) => {
    const stop = stops[stopKey];
    const boardingPointId = stableIdAuthority.resolveByLegacyRef(STABLE_ID_REGISTRY, 'boardingPoint', stopKey);
    if (!boardingPointId) return map;
    const boardingPointOwnerRef = registryOwnerRef(boardingPointId);
    map[boardingPointId] = {
      boardingPointId,
      stopKey,
      nodeId: stop.nodeId,
      groupStopId: stop.groupStopId,
      displayNameTh: stop.displayNameTh,
      lat: stop.lat,
      lng: stop.lng,
      exactness: 'source_proven_stop',
      phase1Role: 'source_proven_main_origin_boarding_point',
      originSelectable: true,
      destinationSelectable: true,
      status: 'active',
      registryOwnerRef: boardingPointOwnerRef,
      sourceLineage: [buildLineage(`data/erpDataCenter/stops/${stopKey}`, stopKey, 'boarding point mirrors source-proven stop for Phase 1')]
    };
    return map;
  }, {});
}

function auditStableIdSourceEntities(destinations, stops) {
  const requests = [];
  Object.keys(destinations).forEach((legacyRef) => requests.push({ entityType: 'networkNode', legacyRef }));
  Object.keys(stops).forEach((legacyRef) => {
    requests.push({ entityType: 'groupStop', legacyRef });
    requests.push({ entityType: 'boardingPoint', legacyRef });
  });
  return stableIdAuthority.auditRequests(STABLE_ID_REGISTRY, requests);
}

function buildServiceGroups(routeGroups) {
  const groups = {};
  Object.keys(routeGroups || {}).sort().forEach((key) => {
    const group = routeGroups[key] || {};
    const serviceGroupId = canonicalGroupId(key);
    groups[serviceGroupId] = {
      serviceGroupId,
      displayNameTh: group.nameTh || group.name || group.groupName || key,
      paymentMode: serviceGroupId === TRAIN_GROUP_ID ? 'external_pay' : 'platform_collect',
      status: 'active',
      sourceLineage: [buildLineage(`publishedCatalog/routeGroups/${key}`, key, 'published service group')]
    };
  });
  return groups;
}

function buildServiceGroupAliases() {
  return Object.keys(GROUP_ALIASES).reduce((aliases, legacyAlias) => {
    aliases[legacyAlias] = {
      alias: legacyAlias,
      serviceGroupId: GROUP_ALIASES[legacyAlias],
      aliasType: legacyAlias === GROUP_ALIASES[legacyAlias] ? 'canonical_passthrough' : 'legacy_migration',
      status: 'active',
      sourceLineage: [buildLineage('owner_decisions/service_group_aliases', legacyAlias, 'owner-approved neutral service group mapping')]
    };
    return aliases;
  }, {});
}

function buildRoutes(publishedCatalog, destinations) {
  const routes = {};
  orderedValues(publishedCatalog.routes).forEach((route) => {
    if (REVIEW_ONLY_ROUTE_IDS.has(route.id)) return;
    const fromKey = keyForLabel(route.from);
    const toKey = keyForLabel(route.to);
    routes[route.id] = {
      routeId: route.id,
      id: route.id,
      serviceGroupId: groupIdOf(route),
      groupId: groupIdOf(route),
      originNodeId: destinations[fromKey] && destinations[fromKey].nodeId,
      destinationNodeId: destinations[toKey] && destinations[toKey].nodeId,
      originDestinationId: fromKey,
      destinationId: toKey,
      fromStopKey: fromKey,
      toStopKey: toKey,
      displayNameTh: `${cleanLabel(route.from)} -> ${cleanLabel(route.to)}`,
      fromDisplayNameTh: cleanLabel(route.from),
      toDisplayNameTh: cleanLabel(route.to),
      phase1SelectionPolicy: {
        originSelectable: groupIdOf(route) === 'group_001',
        destinationSelectable: true,
        originRequiresSourceProvenBoardingPoint: groupIdOf(route) === 'group_001',
        destinationMayBeDestinationOnly: groupIdOf(route) !== 'group_001'
      },
      status: route.isActive === false ? 'inactive' : 'active',
      sourceLineage: [buildLineage(`publishedCatalog/routes/${route.id}`, route.id, 'active Phase 1 published route')]
    };
  });
  return routes;
}

function queueTripCandidateEvidence(offer, queueTrips, routeSequenceVersions) {
  return Object.values(queueTrips).map((queueTrip) => {
    const sequence = routeSequenceVersions[queueTrip.routeSequenceVersionId];
    const sequenceStops = sequence ? sequence.stops : [];
    const originIndex = sequenceStops.findIndex((stop) => stop.nodeId === offer.originNodeId);
    const destinationIndex = sequenceStops.findIndex((stop) => stop.nodeId === offer.destinationNodeId);
    const directionMatches = originIndex >= 0 && destinationIndex > originIndex;
    const originSequenceStop = originIndex >= 0 ? sequenceStops[originIndex] : null;
    const matchingOriginStopTime = originSequenceStop && queueTrip.orderedStopTimes.find((stopTime) => (
      stopTime.groupStopId === originSequenceStop.groupStopId && stopTime.time === offer.departureTime
    ));
    return {
      queueTrip,
      sequence,
      originIndex,
      destinationIndex,
      hasOrigin: originIndex >= 0,
      directionMatches,
      matchingOriginStopTime: matchingOriginStopTime || null,
      exactMatch: directionMatches && !!matchingOriginStopTime
    };
  });
}

function mappingReviewReason(candidateEvidence) {
  const exactCandidates = candidateEvidence.filter((candidate) => candidate.exactMatch);
  if (exactCandidates.length > 1) return 'source_conflict';
  if (!candidateEvidence.some((candidate) => candidate.hasOrigin)) return 'no_queue_trip_candidate';
  if (!candidateEvidence.some((candidate) => candidate.directionMatches)) return 'missing_direction';
  return 'missing_stop_time';
}

function buildScheduleOffers(publishedCatalog, activeRoutes, queueTrips, routeSequenceVersions, stopTimes) {
  const scheduleOffers = {};
  const sourceTrips = orderedValues(publishedCatalog.trips).concat(OWNER_APPROVED_SCHEDULE_OFFER_CORRECTIONS);
  sourceTrips.forEach((trip) => {
    const legacyPublishedTripId = trip.tripId || trip.id;
    const route = activeRoutes[trip.routeId];
    if (!legacyPublishedTripId || !route) return;
    const serviceGroupId = canonicalGroupId(trip.groupId || route.serviceGroupId);
    const offerEvidence = {
      originNodeId: route.originNodeId,
      destinationNodeId: route.destinationNodeId,
      departureTime: trip.departTime
    };
    const candidateEvidence = serviceGroupId === 'group_001'
      ? queueTripCandidateEvidence(offerEvidence, queueTrips, routeSequenceVersions)
      : [];
    const exactCandidates = candidateEvidence.filter((candidate) => candidate.exactMatch);
    const mappedCandidate = exactCandidates.length === 1 ? exactCandidates[0] : null;
    let mappingStatus;
    let mappingReasonCode = null;
    let timeStatus = null;
    let timeType = null;
    if (serviceGroupId === 'group_001' && mappedCandidate) mappingStatus = 'mapped_queue_trip';
    else if (serviceGroupId === 'group_001') {
      mappingStatus = 'estimated_schedule';
      timeStatus = 'owner_estimated';
      timeType = 'estimated_pass_through';
    } else if (serviceGroupId === TRAIN_GROUP_ID) mappingStatus = 'external_schedule';
    else mappingStatus = trip.departTime ? 'departure_only' : 'needs_review';
    if (mappingStatus === 'needs_review' && !mappingReasonCode) mappingReasonCode = 'other';
    const matchingStopTime = mappedCandidate && Object.values(stopTimes).find((stopTime) => (
      stopTime.queueTripId === mappedCandidate.queueTrip.queueTripId &&
      stopTime.groupStopId === mappedCandidate.matchingOriginStopTime.groupStopId &&
      stopTime.departureTime === trip.departTime
    ));
    if (mappedCandidate && matchingStopTime) {
      timeType = matchingStopTime.timeType;
      timeStatus = matchingStopTime.timeStatus;
    } else if (mappingStatus !== 'estimated_schedule') {
      timeType = 'scheduled_origin_departure';
      timeStatus = 'source_scheduled';
    }
    const isEstimated = timeType === 'estimated_pass_through' || timeType === 'estimated_arrival';
    const primaryTimetableAuthority = !!mappedCandidate && timeType === 'scheduled_origin_departure';
    scheduleOffers[legacyPublishedTripId] = {
      recordType: 'schedule_offer',
      mappingStatus,
      legacyPublishedTripId,
      routeId: trip.routeId,
      serviceGroupId,
      departureTime: trip.departTime,
      originNodeId: route.originNodeId,
      destinationNodeId: route.destinationNodeId,
      originDestinationId: route.originDestinationId,
      destinationId: route.destinationId,
      queueTripId: mappedCandidate ? mappedCandidate.queueTrip.queueTripId : null,
      routeSequenceVersionId: mappedCandidate ? mappedCandidate.queueTrip.routeSequenceVersionId : null,
      mappingReasonCode,
      timeStatus,
      timeType,
      estimatedTime: isEstimated ? trip.departTime : null,
      isEstimated,
      planningEligible: true,
      primaryTimetableAuthority,
      timeAuthority: primaryTimetableAuthority ? 'queue_trip_origin' : 'planning_reference',
      guaranteedPickupTime: isEstimated ? false : null,
      exactOperationalProof: false,
      bookingEligibilityStatus: mappingStatus === 'estimated_schedule' ? 'owner_decision_required' : null,
      referenceOnly: isEstimated ? true : null,
      disclaimerKey: isEstimated ? ESTIMATED_TIME_DISCLAIMER_KEY : null,
      disclaimerTh: isEstimated ? ESTIMATED_TIME_DISCLAIMER_TH : null,
      mappingEvidence: mappedCandidate ? {
        rule: 'group_001_unique_origin_time_downstream_v1',
        candidateCount: exactCandidates.length,
        queueTripId: mappedCandidate.queueTrip.queueTripId,
        originGroupStopId: mappedCandidate.matchingOriginStopTime.groupStopId,
        originSequence: mappedCandidate.originIndex + 1,
        destinationSequence: mappedCandidate.destinationIndex + 1,
        matchedDepartureTime: trip.departTime
      } : mappingStatus === 'estimated_schedule' ? {
        rule: 'owner_approved_estimated_schedule_v1',
        candidateCount: exactCandidates.length,
        directionCandidateCount: candidateEvidence.filter((candidate) => candidate.directionMatches).length,
        offeredDepartureTime: trip.departTime,
        sourceOriginMatchesOfferOrigin: !!trip.from && keyForLabel(trip.from) === route.originDestinationId,
        referenceOnly: true,
        timeType
      } : {
        rule: 'group_001_unique_origin_time_downstream_v1',
        candidateCount: exactCandidates.length,
        directionCandidateCount: candidateEvidence.filter((candidate) => candidate.directionMatches).length,
        offeredDepartureTime: trip.departTime,
        reasonCode: mappingReasonCode
      },
      mappingLineage: mappedCandidate ? [].concat(
        mappedCandidate.queueTrip.sourceLineage || [],
        mappedCandidate.sequence.sourceLineage || [],
        matchingStopTime && matchingStopTime.sourceLineage || []
      ) : candidateEvidence.filter((candidate) => candidate.directionMatches).flatMap((candidate) => candidate.sequence.sourceLineage || []),
      approvalLineage: mappingStatus === 'estimated_schedule' ? [buildLineage(
        'ai-handoffs/MAIN-AI-DASHBOARD.md',
        STARTING_SHA,
        'Owner approved unmatched group_001 offers as valid estimated timetable offers'
      )] : [],
      timeSemanticsLineage: isEstimated ? [buildLineage(
        'ai-handoffs/MAIN-AI-DASHBOARD.md',
        STARTING_SHA,
        'Owner classified non-origin timetable times as planning estimates, not exact pickup or operational proof'
      )] : [],
      isPhysicalServiceRun: false,
      legacyBookingEnabled: trip.bookingEnabled !== false,
      status: trip.isActive === false ? 'inactive' : 'active',
      sourceLineage: [buildLineage(
        trip.sourcePath || `publishedCatalog/trips/${legacyPublishedTripId}`,
        trip.sourceId || legacyPublishedTripId,
        trip.sourceNotes || 'published route/departure/OD schedule offer'
      )]
    };
  });
  return scheduleOffers;
}

function buildMappingReview(scheduleOffers, routes) {
  const reviewOffers = Object.values(scheduleOffers).filter((offer) => offer.mappingStatus === 'needs_review');
  const reasonSummary = reviewOffers.reduce((summary, offer) => {
    summary[offer.mappingReasonCode] = (summary[offer.mappingReasonCode] || 0) + 1;
    return summary;
  }, {});
  const grouped = {};
  reviewOffers.forEach((offer) => {
    const key = `${offer.mappingReasonCode}|${offer.routeId}`;
    grouped[key] = grouped[key] || {
      reasonCode: offer.mappingReasonCode,
      routeId: offer.routeId,
      routeNameTh: routes[offer.routeId] && routes[offer.routeId].displayNameTh || '',
      offers: []
    };
    grouped[key].offers.push({
      legacyPublishedTripId: offer.legacyPublishedTripId,
      departureTime: offer.departureTime,
      originDestinationId: offer.originDestinationId,
      destinationId: offer.destinationId
    });
  });
  return {
    total: reviewOffers.length,
    reasonSummary,
    groups: Object.values(grouped).sort((a, b) => a.routeId.localeCompare(b.routeId))
  };
}

function buildEstimatedScheduleSummary(scheduleOffers) {
  const offers = Object.values(scheduleOffers).filter((offer) => offer.mappingStatus === 'estimated_schedule');
  const byServiceGroup = {};
  const byTimeType = { scheduled_origin_departure: 0, estimated_pass_through: 0, unresolved: 0 };
  offers.forEach((offer) => {
    byServiceGroup[offer.serviceGroupId] = (byServiceGroup[offer.serviceGroupId] || 0) + 1;
    if (Object.prototype.hasOwnProperty.call(byTimeType, offer.timeType)) byTimeType[offer.timeType] += 1;
    else byTimeType.unresolved += 1;
  });
  return {
    total: offers.length,
    byServiceGroup,
    byTimeType,
    examples: offers.slice(0, 10).map((offer) => ({
      legacyPublishedTripId: offer.legacyPublishedTripId,
      originDestinationId: offer.originDestinationId,
      destinationId: offer.destinationId,
      estimatedTime: offer.estimatedTime,
      timeType: offer.timeType
    }))
  };
}

function buildRouteSequenceVersions(groupStops) {
  const groupStopByCode = Object.values(groupStops).reduce((map, groupStop) => {
    map[groupStop.groupStopCode] = groupStop;
    return map;
  }, {});
  return Object.keys(ROUTE_SEQUENCE_DEFINITIONS).reduce((versions, routeSequenceVersionId) => {
    const codes = ROUTE_SEQUENCE_DEFINITIONS[routeSequenceVersionId];
    const relatedTrips = ACTIVE_QUEUE_TRIPS.filter((trip) => trip.sequenceId === routeSequenceVersionId);
    versions[routeSequenceVersionId] = {
      routeSequenceVersionId,
      serviceGroupId: 'group_001',
      direction: Number(codes[0].slice(-3)) < Number(codes[codes.length - 1].slice(-3)) ? 'outbound' : 'return',
      effectiveFrom: 'phase_1',
      effectiveTo: null,
      status: 'active',
      registryOwnerRef: registryOwnerRef(routeSequenceVersionId),
      stops: codes.map((groupStopCode, index) => ({
        sequence: index + 1,
        groupStopCode,
        groupStopId: groupStopByCode[groupStopCode].groupStopId,
        nodeId: groupStopByCode[groupStopCode].nodeId
      })),
      sourceLineage: relatedTrips.map((trip) => buildLineage(
        trip.ownerApproved ? 'owner_decisions/queue_005' : `routeData/queues/${trip.sourceQueue}/trips/${trip.sourceTrip}`,
        trip.queueTripId,
        'normalized shared route sequence evidence'
      ))
    };
    return versions;
  }, {});
}

function buildTripSequenceAssignments() {
  return ACTIVE_QUEUE_TRIPS.reduce((assignments, trip) => {
    const assignmentId = trip.tripSequenceAssignmentId;
    assignments[assignmentId] = {
      tripSequenceAssignmentId: assignmentId,
      queueTripId: trip.queueTripId,
      queueId: trip.queueId,
      routeSequenceVersionId: trip.sequenceId,
      registryOwnerRef: registryOwnerRef(assignmentId),
      status: 'active',
      sourceLineage: [buildLineage(
        trip.ownerApproved ? 'owner_decisions/queue_005' : `routeData/queues/${trip.sourceQueue}/trips/${trip.sourceTrip}`,
        trip.queueTripId,
        'active queue trip to normalized route sequence assignment'
      )]
    };
    return assignments;
  }, {});
}

function mapStopTimeTrip(routeKey, departTime, stopTime) {
  const routeId = ROUTE_KEY_MAP[routeKey] || '';
  if (!routeId) return { routeId: '', tripId: '' };
  if (routeId === 'ROUTE-MAIN-021' && INTERMEDIATE_TRIP_021_1400_TIMES.has(stopTime || departTime)) {
    return { routeId, tripId: 'TRIP-ROUTE-MAIN-021-1400' };
  }
  return { routeId, tripId: `TRIP-${routeId}-${String(departTime || '').replace(':', '')}` };
}

function stopTimeSemantics(sequence, sequenceLength) {
  if (sequence === 1) {
    return {
      timeType: 'scheduled_origin_departure',
      stopRole: 'scheduled_departure_point',
      stopBehaviors: ['scheduled_departure_point'],
      pickupOnDemand: false,
      noWaitingStop: false,
      conditionalWaitingPoint: false,
      conditionalWaitingApproval: null,
      timeStatus: 'scheduled',
      isEstimated: false,
      referenceOnly: false,
      primaryTimetableAuthority: true,
      usagePolicy: 'primary_timetable_authority'
    };
  }
  const isDestination = sequence === sequenceLength;
  return {
    timeType: isDestination ? 'estimated_arrival' : 'estimated_pass_through',
    stopRole: isDestination ? 'destination_endpoint' : 'pass_through_stop',
    stopBehaviors: isDestination
      ? ['drop_off_endpoint', 'no_waiting_stop']
      : ['pass_through_stop', 'pickup_on_demand', 'no_waiting_stop'],
    pickupOnDemand: !isDestination,
    noWaitingStop: true,
    conditionalWaitingPoint: false,
    conditionalWaitingApproval: null,
    timeStatus: 'owner_estimated',
    isEstimated: true,
    referenceOnly: true,
    primaryTimetableAuthority: false,
    usagePolicy: 'planning_reference_only',
    disclaimerKey: ESTIMATED_TIME_DISCLAIMER_KEY,
    disclaimerTh: ESTIMATED_TIME_DISCLAIMER_TH,
    guaranteedPickupTime: false,
    exactOperationalProof: false
  };
}

function buildStopTimes(routeData, publishedCatalog, groupStops) {
  const stopTimes = {};
  const corroboratingRows = [];
  Object.keys(routeData.queues || {}).sort((a, b) => Number(a) - Number(b)).forEach((queueKey) => {
    const queue = routeData.queues[queueKey];
    if (!queue || !queue.trips) return;
    Object.keys(queue.trips).sort((a, b) => Number(a) - Number(b)).forEach((tripKey) => {
      const trip = queue.trips[tripKey];
      if (!trip || !Array.isArray(trip.stops)) return;
      trip.stops.forEach((stop, index) => {
        const stopKey = normalizeStopKey(stop.stopKey || stop.key);
        const time = stop.time || stop.departureTime || stop.arrivalTime || trip.departTime;
        const mapped = mapStopTimeTrip(trip.routeKey, trip.departTime, time);
        const stopTimeId = `${mapped.tripId || trip.routeKey}_${String(index + 1).padStart(2, '0')}_${stopKey}`;
        stopTimes[stopTimeId] = {
          stopTimeId,
          tripId: mapped.tripId,
          routeId: mapped.routeId,
          routeKey: trip.routeKey,
          stopKey,
          sequence: Number(stop.order || index + 1),
          arrivalTime: time,
          departureTime: time,
          queueNo: Number(queueKey),
          sourceTripNo: Number(tripKey),
          status: 'active',
          sourceLineage: [buildLineage(`routeData/queues/${queueKey}/trips/${tripKey}/stops/${index}`, stopKey, 'unique routeData stop-time row')]
        };
      });
    });
  });

  Object.keys(publishedCatalog.stopTimes || {}).sort((a, b) => Number(a) - Number(b)).forEach((containerKey) => {
    const container = publishedCatalog.stopTimes[containerKey];
    if (!container || !Array.isArray(container.stops)) return;
    container.stops.forEach((stop, index) => {
      const stopKey = normalizeStopKey(stop.stopKey);
      const mapped = mapStopTimeTrip(container.routeKey, container.departTime, stop.time);
      const stopTimeId = `${mapped.tripId || container.routeKey}_${String(Number(stop.order || index + 1)).padStart(2, '0')}_${stopKey}`;
      corroboratingRows.push({
        sourcePath: `publishedCatalog/stopTimes/${containerKey}/stops/${index}`,
        stopTimeId,
        routeId: mapped.routeId,
        tripId: mapped.tripId,
        stopKey,
        time: stop.time
      });
      if (stopTimes[stopTimeId]) {
        stopTimes[stopTimeId].sourceLineage.push(buildLineage(`publishedCatalog/stopTimes/${containerKey}/stops/${index}`, stopKey, 'duplicate corroborating stop-time evidence'));
      }
    });
  });

  const groupStopByCode = Object.values(groupStops).reduce((map, groupStop) => {
    map[groupStop.groupStopCode] = groupStop;
    return map;
  }, {});
  const activeTripById = new Map(ACTIVE_QUEUE_TRIPS.map((trip) => [trip.legacyPublishedTripId, trip]));
  const normalizedStopTimes = {};

  Object.values(stopTimes).forEach((stopTime) => {
    const activeTrip = activeTripById.get(stopTime.tripId);
    if (!activeTrip) return;
    const sequenceCodes = ROUTE_SEQUENCE_DEFINITIONS[activeTrip.sequenceId];
    const corridor = CORRIDOR_BY_STOP_KEY.get(stopTime.stopKey);
    const sequence = corridor ? sequenceCodes.indexOf(corridor.code) + 1 : 0;
    if (sequence < 1) return;
    const groupStop = groupStopByCode[corridor.code];
    const stopTimeId = `${activeTrip.queueTripId}_${String(sequence).padStart(2, '0')}_${stopTime.stopKey}`;
    const normalized = Object.assign({}, stopTime, {
      stopTimeId,
      queueTripId: activeTrip.queueTripId,
      legacyPublishedTripId: activeTrip.legacyPublishedTripId,
      sequence,
      groupStopCode: corridor.code,
      groupStopId: groupStop.groupStopId,
      nodeId: groupStop.nodeId,
      routeSequenceVersionId: activeTrip.sequenceId,
      queueId: activeTrip.queueId
    }, stopTimeSemantics(sequence, sequenceCodes.length));
    if (normalized.isEstimated) {
      normalized.timeSemanticsLineage = [buildLineage('ai-handoffs/MAIN-AI-DASHBOARD.md', STARTING_SHA, 'Owner classified intermediate and destination stop times as rough planning estimates')];
    }
    delete normalized.tripId;
    if (activeTrip.queueId === 'queue_002' && activeTrip.sourceTrip === 1) {
      normalized.conflictLineage = {
        code: 'legacy-order-malformed',
        rawOrder: stopTime.sequence,
        normalizedOrder: sequence,
        resolution: 'owner-approved canonical reverse corridor and chronological times'
      };
    }
    if (normalizedStopTimes[stopTimeId]) {
      normalizedStopTimes[stopTimeId].sourceLineage = normalizedStopTimes[stopTimeId].sourceLineage.concat(normalized.sourceLineage);
    } else {
      normalizedStopTimes[stopTimeId] = normalized;
    }
  });

  ACTIVE_QUEUE_TRIPS.filter((trip) => trip.queueId === 'queue_005').forEach((trip) => {
    const codes = ROUTE_SEQUENCE_DEFINITIONS[trip.sequenceId];
    QUEUE_005_STOP_TIMES[trip.legacyPublishedTripId].forEach((time, index) => {
      const groupStop = groupStopByCode[codes[index]];
      const stopTimeId = `${trip.queueTripId}_${String(index + 1).padStart(2, '0')}_${groupStop.groupStopCode}`;
      normalizedStopTimes[stopTimeId] = Object.assign({
        stopTimeId,
        queueTripId: trip.queueTripId,
        legacyPublishedTripId: trip.legacyPublishedTripId,
        routeId: trip.routeId,
        stopKey: CORRIDOR.find((entry) => entry.code === groupStop.groupStopCode).stopKey,
        sequence: index + 1,
        arrivalTime: time,
        departureTime: time,
        groupStopCode: groupStop.groupStopCode,
        groupStopId: groupStop.groupStopId,
        nodeId: groupStop.nodeId,
        routeSequenceVersionId: trip.sequenceId,
        queueId: trip.queueId,
        status: 'active',
        sourceLineage: [buildLineage('owner_decisions/queue_005', `${trip.legacyPublishedTripId}:${groupStop.groupStopCode}`, 'owner-approved queue_005 stop time')]
      }, stopTimeSemantics(index + 1, codes.length));
      if (normalizedStopTimes[stopTimeId].isEstimated) {
        normalizedStopTimes[stopTimeId].timeSemanticsLineage = [buildLineage('ai-handoffs/MAIN-AI-DASHBOARD.md', STARTING_SHA, 'Owner classified intermediate and destination stop times as rough planning estimates')];
      }
    });
  });

  return { stopTimes: normalizedStopTimes, corroboratingRows };
}

function buildFareInputs(publishedCatalog) {
  const routes = orderedValues(publishedCatalog.routes).filter((route) => !REVIEW_ONLY_ROUTE_IDS.has(route.id));
  const directRoutes = routes.filter((route) => groupIdOf(route) !== TRAIN_GROUP_ID);
  const trainRoutes = routes.filter((route) => groupIdOf(route) === TRAIN_GROUP_ID);
  const directMap = new Map();
  directRoutes.forEach((route) => {
    directMap.set(`${keyForLabel(route.from)}>${keyForLabel(route.to)}`, {
      route,
      amount: fareAmountOf(publishedCatalog, route)
    });
  });
  return { routes, directRoutes, trainRoutes, directMap };
}

function buildStopTimeRoleSummary(stopTimes) {
  return Object.values(stopTimes).reduce((summary, stopTime) => {
    if (!Object.prototype.hasOwnProperty.call(summary, stopTime.timeType)) summary.unresolved += 1;
    else summary[stopTime.timeType] += 1;
    return summary;
  }, {
    scheduled_origin_departure: 0,
    estimated_pass_through: 0,
    estimated_arrival: 0,
    unresolved: 0
  });
}

function buildFares(publishedCatalog, stops) {
  const { directRoutes, trainRoutes, directMap } = buildFareInputs(publishedCatalog);
  const fares = {};
  const directKeys = new Set();

  function setFare(originKey, destKey, fare) {
    fares[originKey] = fares[originKey] || {};
    fares[originKey][destKey] = fare;
  }

  directRoutes.forEach((route) => {
    const originKey = keyForLabel(route.from);
    const destKey = keyForLabel(route.to);
    const amount = fareAmountOf(publishedCatalog, route);
    directKeys.add(`${originKey}>${destKey}`);
    setFare(originKey, destKey, {
      fareId: `${originKey}_${destKey}`,
      originStopKey: originKey,
      destStopKey: destKey,
      routeId: route.id,
      serviceGroupId: groupIdOf(route),
      pricingMode: 'direct',
      approvalStatus: 'approved',
      currency: 'THB',
      amount,
      baseFare: amount,
      totalFare: amount,
      paymentOwnership: 'sl_transit',
      combineRule: 'direct_published_route_fare',
      sourceLineage: [buildLineage(`publishedCatalog/fares/${route.id}`, route.id, 'published non-train route fare')]
    });
  });

  const destinationKeys = Array.from(new Set(directRoutes.flatMap((route) => [keyForLabel(route.from), keyForLabel(route.to)]))).sort();
  const viaCandidates = [];
  destinationKeys.forEach((originKey) => {
    destinationKeys.forEach((destKey) => {
      if (originKey === destKey || directKeys.has(`${originKey}>${destKey}`)) return;
      const first = directMap.get(`${originKey}>chachoengsao`);
      const second = directMap.get(`chachoengsao>${destKey}`);
      if (!first || !second || first.amount <= 0 || second.amount <= 0) return;
      viaCandidates.push({ originKey, destKey, first, second });
    });
  });
  viaCandidates.slice(0, TARGET_COUNTS.transferRules).forEach((item) => {
    const amount = item.first.amount + item.second.amount;
    setFare(item.originKey, item.destKey, {
      fareId: `${item.originKey}_${item.destKey}`,
      originStopKey: item.originKey,
      destStopKey: item.destKey,
      serviceGroupId: 'group_001',
      pricingMode: 'via_chachoengsao',
      approvalStatus: 'approved',
      currency: 'THB',
      amount,
      baseFare: amount,
      totalFare: amount,
      paymentOwnership: 'sl_transit',
      transfer: { required: true, viaStopKey: 'chachoengsao' },
      segments: [
        { routeId: item.first.route.id, originStopKey: item.originKey, destStopKey: 'chachoengsao', amount: item.first.amount },
        { routeId: item.second.route.id, originStopKey: 'chachoengsao', destStopKey: item.destKey, amount: item.second.amount }
      ],
      combineRule: 'sum_verified_segments_via_chachoengsao',
      sourceLineage: [
        buildLineage(`publishedCatalog/fares/${item.first.route.id}`, item.first.route.id, 'first verified segment'),
        buildLineage(`publishedCatalog/fares/${item.second.route.id}`, item.second.route.id, 'second verified segment')
      ]
    });
  });

  const stopKeys = Object.keys(stops).sort();
  trainRoutes.forEach((route) => {
    const trainDestKey = keyForLabel(route.to);
    stopKeys.forEach((originKey) => {
      setFare(originKey, trainDestKey, {
        fareId: `${originKey}_${trainDestKey}`,
        originStopKey: originKey,
        destStopKey: trainDestKey,
        routeId: route.id,
        serviceGroupId: TRAIN_GROUP_ID,
        pricingMode: 'external_pay',
        approvalStatus: 'approved',
        currency: 'THB',
        amount: 0,
        baseFare: 0,
        totalFare: 0,
        platformFareAmount: 0,
        collectedAmount: 0,
        paymentOwnership: 'external_pay',
        saleStatus: 'external_payment_required',
        riskFlags: ['train_fare_paid_outside_system'],
        sourceLineage: [buildLineage(`publishedCatalog/routes/${route.id}`, route.id, 'owner-approved train external_pay policy')]
      });
    });
  });

  return fares;
}

function flattenFareCount(fares) {
  return Object.keys(fares || {}).reduce((count, originKey) => count + Object.keys(fares[originKey] || {}).length, 0);
}

function buildFareSegments(publishedCatalog) {
  const segments = {};
  orderedValues(publishedCatalog.routes).filter((route) => !REVIEW_ONLY_ROUTE_IDS.has(route.id)).forEach((route) => {
    const amount = groupIdOf(route) === TRAIN_GROUP_ID ? 0 : fareAmountOf(publishedCatalog, route);
    segments[route.id] = {
      fareSegmentId: route.id,
      routeId: route.id,
      originStopKey: keyForLabel(route.from),
      destStopKey: keyForLabel(route.to),
      serviceGroupId: groupIdOf(route),
      pricingMode: groupIdOf(route) === TRAIN_GROUP_ID ? 'external_pay' : 'direct',
      currency: 'THB',
      amount,
      paymentOwnership: groupIdOf(route) === TRAIN_GROUP_ID ? 'external_pay' : 'sl_transit',
      sourceLineage: [buildLineage(`publishedCatalog/fares/${route.id}`, route.id, 'route-keyed legacy fare segment')]
    };
  });
  return segments;
}

function buildTransferRules(fares) {
  const rules = {};
  Object.keys(fares).sort().forEach((originKey) => {
    Object.keys(fares[originKey]).sort().forEach((destKey) => {
      const fare = fares[originKey][destKey];
      if (fare.pricingMode !== 'via_chachoengsao') return;
      const transferRuleId = `${originKey}_${destKey}_via_chachoengsao`;
      rules[transferRuleId] = {
        transferRuleId,
        originStopKey: originKey,
        destStopKey: destKey,
        viaStopKey: 'chachoengsao',
        segmentRouteIds: fare.segments.map((segment) => segment.routeId),
        combineRule: 'sum_verified_segments_via_chachoengsao',
        status: 'active',
        sourceLineage: fare.sourceLineage.slice()
      };
    });
  });
  return rules;
}

function buildPaymentOwnership() {
  return {
    platform_collect: {
      paymentOwnershipId: 'platform_collect',
      displayName: 'SL-Transit platform collect',
      policy: 'non_train_fares_collected_through_platform',
      status: 'active',
      sourceLineage: [buildLineage('owner_decisions/payment_policy', 'platform_collect', 'confirmed owner decision')]
    },
    external_pay: {
      paymentOwnershipId: 'external_pay',
      displayName: 'External payment',
      policy: 'train_fare_paid_directly_outside_sl_transit',
      status: 'active',
      sourceLineage: [buildLineage('owner_decisions/payment_policy', 'external_pay', 'confirmed owner decision')]
    }
  };
}

function buildVehicles() {
  return [1, 2, 3, 4, 5].reduce((map, n) => {
    const vehicleId = `veh_${String(n).padStart(3, '0')}`;
    map[vehicleId] = {
      vehicleId,
      status: 'provisional',
      productionReady: false,
      legacyAliases: [`car${n}`],
      liveTrackingAvailable: n === 5 ? false : true,
      registrationNo: '',
      loginIndexReady: false,
      sourceLineage: [buildLineage('owner_decisions/fleet', vehicleId, `future vehicle identity with legacy alias car${n}`)]
    };
    return map;
  }, {});
}

function buildQueues() {
  return [1, 2, 3, 4, 5].reduce((map, n) => {
    const queueId = `queue_${String(n).padStart(3, '0')}`;
    map[queueId] = {
      queueId,
      serviceGroupId: 'group_001',
      groupId: 'group_001',
      displayNameTh: `คิว ${n}`,
      legacyQueueNo: n,
      assignmentMode: n === 5 ? 'fixed' : 'rotation',
      status: 'active',
      sourceLineage: [buildLineage(n === 5 ? 'owner_decisions/queue_005' : 'routeData/queues', String(n), n === 5 ? 'owner-approved fixed queue' : 'legacy queue metadata')]
    };
    return map;
  }, {});
}

function buildQueueTrips(stopTimes) {
  return ACTIVE_QUEUE_TRIPS.reduce((queueTrips, trip) => {
    const queueTripId = trip.queueTripId;
    const orderedStopTimes = Object.values(stopTimes)
      .filter((stopTime) => stopTime.queueTripId === queueTripId)
      .sort((a, b) => a.sequence - b.sequence);
    queueTrips[queueTripId] = {
      queueTripId,
      queueId: trip.queueId,
      queueScheduleVersionId: stableIdFor('queueScheduleVersion', `queueScheduleVersion:${trip.queueId.slice(-3).padStart(6, '0')}`),
      routeId: trip.routeId,
      legacyPublishedTripId: trip.legacyPublishedTripId,
      routeSequenceVersionId: trip.sequenceId,
      assignmentMode: trip.queueId === 'queue_005' ? 'fixed' : 'rotation',
      vehicleId: trip.queueId === 'queue_005' ? 'veh_005' : null,
      serviceDays: trip.queueId === 'queue_005' ? ['daily'] : ['legacy_schedule'],
      scheduleOnly: false,
      liveTrackingAvailable: trip.queueId === 'queue_005' ? false : true,
      registryOwnerRef: registryOwnerRef(queueTripId),
      orderedStopTimes: orderedStopTimes.map((stopTime) => ({
        sequence: stopTime.sequence,
        groupStopId: stopTime.groupStopId,
        groupStopCode: stopTime.groupStopCode,
        time: stopTime.departureTime,
        timeType: stopTime.timeType,
        stopRole: stopTime.stopRole,
        stopBehaviors: stopTime.stopBehaviors.slice(),
        pickupOnDemand: stopTime.pickupOnDemand,
        noWaitingStop: stopTime.noWaitingStop,
        conditionalWaitingPoint: stopTime.conditionalWaitingPoint,
        conditionalWaitingApproval: stopTime.conditionalWaitingApproval
      })),
      status: 'active',
      sourceLineage: [buildLineage(
        trip.ownerApproved ? 'owner_decisions/queue_005' : `routeData/queues/${trip.sourceQueue}/trips/${trip.sourceTrip}`,
        trip.legacyPublishedTripId,
        'normalized active queue trip'
      )]
    };
    return queueTrips;
  }, {});
}

function buildQueueScheduleVersions(queueTrips) {
  return [1, 2, 3, 4, 5].reduce((versions, n) => {
    const queueId = `queue_${String(n).padStart(3, '0')}`;
    const queueScheduleVersionId = stableIdFor('queueScheduleVersion', `queueScheduleVersion:${String(n).padStart(6, '0')}`);
    versions[queueScheduleVersionId] = {
      queueScheduleVersionId,
      queueId,
      effectiveFrom: 'phase_1',
      effectiveTo: null,
      serviceDays: n === 5 ? ['daily'] : ['legacy_schedule'],
      queueTripIds: Object.values(queueTrips).filter((trip) => trip.queueId === queueId).map((trip) => trip.queueTripId),
      status: 'active',
      registryOwnerRef: registryOwnerRef(queueScheduleVersionId),
      sourceLineage: [buildLineage(n === 5 ? 'owner_decisions/queue_005' : 'routeData/queues', String(n), 'effective-dated queue schedule')]
    };
    return versions;
  }, {});
}

function buildAssignmentRules() {
  return {
    rotation_rule_v1: {
      assignmentRuleId: 'rotation_rule_v1',
      assignmentMode: 'rotation',
      vehicleIds: ['veh_001', 'veh_002', 'veh_003', 'veh_004'],
      queueIds: ['queue_001', 'queue_002', 'queue_003', 'queue_004'],
      effectiveFrom: 'phase_1',
      effectiveTo: null,
      manualOverrideSupported: true,
      status: 'active',
      sourceLineage: [buildLineage('settings/queueRotation', 'rotation_rule_v1', 'legacy rotation normalized to stable vehicle and queue identities')]
    },
    fixed_queue_005_v1: {
      assignmentRuleId: 'fixed_queue_005_v1',
      assignmentMode: 'fixed',
      vehicleId: 'veh_005',
      queueId: 'queue_005',
      effectiveFrom: 'phase_1',
      effectiveTo: null,
      manualOverrideSupported: true,
      status: 'active',
      sourceLineage: [buildLineage('owner_decisions/queue_005', 'fixed_queue_005_v1', 'veh_005 fixed to queue_005')]
    }
  };
}

function countMap(map) {
  return Object.keys(map || {}).length;
}

function buildCounts(erp) {
  return {
    destinations: countMap(erp.destinations),
    networkNodes: countMap(erp.networkNodes),
    stops: countMap(erp.stops),
    boardingPoints: countMap(erp.boardingPoints),
    terminals: countMap(erp.terminals),
    providers: countMap(erp.providers),
    serviceGroups: countMap(erp.serviceGroups),
    serviceGroupAliases: countMap(erp.serviceGroupAliases),
    groupStops: countMap(erp.groupStops),
    routes: countMap(erp.routes),
    routeSequenceVersions: countMap(erp.routeSequenceVersions),
    tripSequenceAssignments: countMap(erp.tripSequenceAssignments),
    scheduleOffers: countMap(erp.scheduleOffers),
    stopTimes: countMap(erp.stopTimes),
    fares: flattenFareCount(erp.fares),
    fareSegments: countMap(erp.fareSegments),
    transferRules: countMap(erp.transferRules),
    paymentOwnership: countMap(erp.paymentOwnership),
    serviceFees: countMap(erp.serviceFees),
    temporaryClosures: countMap(erp.temporaryClosures),
    vehicles: countMap(erp.fleet.vehicles),
    queues: countMap(erp.fleet.queues),
    queueScheduleVersions: countMap(erp.fleet.queueScheduleVersions),
    queueTrips: countMap(erp.fleet.queueTrips),
    assignmentRules: countMap(erp.fleet.assignmentRules),
    drivers: countMap(erp.fleet.drivers),
    vehicleLoginIndex: countMap(erp.fleet.vehicleLoginIndex),
    settlementRecipients: countMap(erp.settlementRecipients),
    stableIdRegistryEntries: countMap(erp.meta.stableIdRegistry.entries),
    metaVersions: countMap(erp.meta.versions),
    metaAudit: countMap(erp.meta.audit)
  };
}

function addCountValidation(validation, counts) {
  Object.keys(TARGET_COUNTS).forEach((key) => {
    if (counts[key] !== TARGET_COUNTS[key]) {
      validation.blockers.push({
        level: 'blocker',
        code: 'unexpected-dry-run-count',
        path: `data/erpDataCenter/${key}`,
        expected: TARGET_COUNTS[key],
        actual: counts[key]
      });
    }
  });
}

function validateStableIdRegistry(erp) {
  const blockers = [];
  const registry = erp.meta && erp.meta.stableIdRegistry;
  if (!registry || !registry.entries) return { blockers: [{ level: 'blocker', code: 'stable-id-registry-missing', path: 'data/erpDataCenter/meta/stableIdRegistry' }] };
  const entries = registry.entries;
  const ownerClaims = new Set();
  const stableIdClaims = new Set();
  const legacyClaims = new Set();
  const expectedPatterns = {
    networkNode: /^node_\d{6}$/,
    groupStop: /^gs_\d{6}$/,
    boardingPoint: /^bp_\d{6}$/,
    routeSequenceVersion: /^rsv_\d{6}$/,
    queueTrip: /^qt_\d{6}$/,
    tripSequenceAssignment: /^tsa_\d{6}$/,
    queueScheduleVersion: /^qsv_\d{6}$/
  };
  const entityMaps = {
    networkNode: erp.networkNodes,
    groupStop: erp.groupStops,
    boardingPoint: erp.boardingPoints,
    routeSequenceVersion: erp.routeSequenceVersions,
    queueTrip: erp.fleet.queueTrips,
    tripSequenceAssignment: erp.tripSequenceAssignments,
    queueScheduleVersion: erp.fleet.queueScheduleVersions
  };
  const idFields = {
    networkNode: 'nodeId',
    groupStop: 'groupStopId',
    boardingPoint: 'boardingPointId',
    routeSequenceVersion: 'routeSequenceVersionId',
    queueTrip: 'queueTripId',
    tripSequenceAssignment: 'tripSequenceAssignmentId',
    queueScheduleVersion: 'queueScheduleVersionId'
  };
  function block(code, path, value) {
    blockers.push({ level: 'blocker', code, path, value });
  }
  Object.keys(entries).forEach((entryKey) => {
    const entry = entries[entryKey];
    const path = `data/erpDataCenter/meta/stableIdRegistry/entries/${entryKey}`;
    if (entryKey !== entry.stableId) block('stable-id-key-mismatch', path, entry.stableId);
    if (stableIdClaims.has(entry.stableId)) block('duplicate-stable-id-ownership', path, entry.stableId);
    stableIdClaims.add(entry.stableId);
    const ownerClaim = `${entry.entityType}|${entry.ownerRef}`;
    if (ownerClaims.has(ownerClaim)) block('duplicate-registry-owner', path, ownerClaim);
    ownerClaims.add(ownerClaim);
    if (entry.status !== 'active' && entry.status !== 'retired') block('stable-id-status-invalid', path, entry.status);
    if (!entry.createdVersion || !entry.sourceLineage || !entry.sourceLineage.length) block('stable-id-audit-fields-missing', path);
    if (entry.status === 'retired' && !entry.retiredMetadata) block('retired-id-metadata-missing', path);
    if (!expectedPatterns[entry.entityType] || !expectedPatterns[entry.entityType].test(entry.stableId)) block('semantic-or-hash-stable-id', path, entry.stableId);
    (entry.legacyRefs || []).forEach((legacyRef) => {
      const legacyClaim = `${entry.entityType}|${legacyRef}`;
      if (legacyClaims.has(legacyClaim)) block('duplicate-legacy-reference-ownership', path, legacyRef);
      legacyClaims.add(legacyClaim);
    });
    const entityMap = entityMaps[entry.entityType];
    const entity = entityMap && entityMap[entry.stableId];
    if (entry.status === 'active' && !entity) block('registered-entity-missing', path, entry.stableId);
    else if (entity && entity.registryOwnerRef !== entry.ownerRef) block('stable-id-reassignment', path, { expected: entry.ownerRef, actual: entity.registryOwnerRef });
    if (entry.status === 'retired' && entity && entity.status !== 'retired') block('retired-stable-id-reused', path, entry.stableId);
  });
  Object.keys(entityMaps).forEach((entityType) => {
    Object.values(entityMaps[entityType] || {}).forEach((entity) => {
      const stableId = entity[idFields[entityType]];
      if (!expectedPatterns[entityType].test(stableId || '')) block('semantic-or-hash-stable-id', `data/erpDataCenter/${entityType}`, stableId);
      if (!entries[stableId]) block('entity-stable-id-unregistered', `data/erpDataCenter/${entityType}`, stableId);
      else if (entries[stableId].status === 'retired' && entity.status !== 'retired') block('retired-stable-id-reused', `data/erpDataCenter/${entityType}`, stableId);
    });
  });
  return { blockers };
}

function validateReferences(erp) {
  const blockers = [];
  const warnings = [];
  const routes = erp.routes;
  const scheduleOffers = erp.scheduleOffers;
  const stops = erp.stops;
  const boardingPoints = erp.boardingPoints;
  const destinations = erp.destinations;
  const networkNodes = erp.networkNodes;
  const groupStops = erp.groupStops;
  const boardingPointNodeIds = new Set(Object.values(boardingPoints).map((boardingPoint) => boardingPoint.nodeId));
  const groupStopByCode = Object.values(groupStops).reduce((map, groupStop) => {
    map[groupStop.groupStopCode] = groupStop;
    return map;
  }, {});

  function block(code, path, value) {
    blockers.push({ level: 'blocker', code, path, value });
  }

  Object.values(erp.serviceGroups).forEach((group) => {
    if (LEGACY_CANONICAL_GROUP_IDS.has(group.serviceGroupId)) block('legacy-group-used-as-canonical-id', `data/erpDataCenter/serviceGroups/${group.serviceGroupId}`);
  });
  Object.values(groupStops).forEach((groupStop) => {
    if (!networkNodes[groupStop.nodeId]) block('group-stop-node-missing', `data/erpDataCenter/groupStops/${groupStop.groupStopId}`, groupStop.nodeId);
    if (!erp.serviceGroups[groupStop.serviceGroupId]) block('group-stop-service-group-missing', `data/erpDataCenter/groupStops/${groupStop.groupStopId}`, groupStop.serviceGroupId);
    if (!Number.isFinite(groupStop.lat) || !Number.isFinite(groupStop.lng)) block('group-stop-coordinates-missing', `data/erpDataCenter/groupStops/${groupStop.groupStopId}`);
    if (groupStop.stopRole || groupStop.waitingPolicy || groupStop.conditionalWaitingPoint === true) block('global-group-stop-operational-role-forbidden', `data/erpDataCenter/groupStops/${groupStop.groupStopId}`);
  });
  Object.values(networkNodes).forEach((node) => {
    if (node.stopRole || node.waitingPolicy || node.conditionalWaitingPoint === true) block('global-network-node-operational-role-forbidden', `data/erpDataCenter/networkNodes/${node.nodeId}`);
  });

  Object.keys(routes).forEach((routeId) => {
    const route = routes[routeId];
    if (!destinations[route.originDestinationId]) warnings.push({ code: 'route-origin-destination-missing', path: `data/erpDataCenter/routes/${routeId}`, value: route.originDestinationId });
    if (!destinations[route.destinationId]) warnings.push({ code: 'route-destination-missing', path: `data/erpDataCenter/routes/${routeId}`, value: route.destinationId });
    if (!networkNodes[route.originNodeId]) block('route-origin-node-missing', `data/erpDataCenter/routes/${routeId}`, route.originNodeId);
    if (!networkNodes[route.destinationNodeId]) block('route-destination-node-missing', `data/erpDataCenter/routes/${routeId}`, route.destinationNodeId);
    if (route.phase1SelectionPolicy && route.phase1SelectionPolicy.originSelectable && !boardingPointNodeIds.has(route.originNodeId)) block('origin-route-missing-source-proven-boarding-point', `data/erpDataCenter/routes/${routeId}`, route.originNodeId);
    if (LEGACY_CANONICAL_GROUP_IDS.has(route.serviceGroupId)) block('legacy-group-used-as-canonical-id', `data/erpDataCenter/routes/${routeId}`, route.serviceGroupId);
  });
  Object.keys(destinations).forEach((destinationId) => {
    const destination = destinations[destinationId];
    if (destination.phaseStatus === 'origin_disabled' && destination.originSelectable === true) {
      blockers.push({ code: 'origin-disabled-node-origin-selectable', path: `data/erpDataCenter/destinations/${destinationId}` });
    }
    if (destination.phaseStatus === 'origin_disabled' && destination.destinationSelectable !== true) {
      blockers.push({ code: 'origin-disabled-node-not-destination-selectable', path: `data/erpDataCenter/destinations/${destinationId}` });
    }
  });
  const mappingStatusSummary = { mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 0, external_schedule: 0, needs_review: 0 };
  const mappingStatusByGroup = Object.keys(EXPECTED_MAPPING_STATUS_BY_GROUP).reduce((summary, groupId) => {
    summary[groupId] = { mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 0, external_schedule: 0, needs_review: 0 };
    return summary;
  }, {});
  const estimatedScheduleSummary = {
    byServiceGroup: {},
    byTimeType: { scheduled_origin_departure: 0, estimated_pass_through: 0, unresolved: 0 }
  };
  const scheduleOfferTimeTypeSummary = {};
  const allowedReviewReasons = new Set(['no_queue_trip_candidate', 'missing_stop_time', 'missing_direction', 'source_conflict', 'other']);
  Object.keys(scheduleOffers).forEach((legacyPublishedTripId) => {
    const offer = scheduleOffers[legacyPublishedTripId];
    const path = `data/erpDataCenter/scheduleOffers/${legacyPublishedTripId}`;
    if (offer.recordType !== 'schedule_offer') block('schedule-offer-record-type-missing-or-invalid', path, offer.recordType);
    if (!Object.prototype.hasOwnProperty.call(mappingStatusSummary, offer.mappingStatus)) block('schedule-offer-mapping-status-missing-or-invalid', path, offer.mappingStatus);
    else {
      mappingStatusSummary[offer.mappingStatus] += 1;
      scheduleOfferTimeTypeSummary[offer.mappingStatus] = scheduleOfferTimeTypeSummary[offer.mappingStatus] || { scheduled_origin_departure: 0, estimated_pass_through: 0, estimated_arrival: 0, unresolved: 0 };
      if (Object.prototype.hasOwnProperty.call(scheduleOfferTimeTypeSummary[offer.mappingStatus], offer.timeType)) scheduleOfferTimeTypeSummary[offer.mappingStatus][offer.timeType] += 1;
      else scheduleOfferTimeTypeSummary[offer.mappingStatus].unresolved += 1;
      if (!mappingStatusByGroup[offer.serviceGroupId]) block('schedule-offer-service-group-invalid', path, offer.serviceGroupId);
      else mappingStatusByGroup[offer.serviceGroupId][offer.mappingStatus] += 1;
    }
    if (!offer.sourceLineage || !offer.sourceLineage.length) block('schedule-offer-lineage-missing', path);
    if (offer.legacyPublishedTripId !== legacyPublishedTripId) block('schedule-offer-legacy-id-mismatch', path, offer.legacyPublishedTripId);
    if (!routes[offer.routeId]) block('schedule-offer-route-missing', path, offer.routeId);
    if (!networkNodes[offer.originNodeId] || !networkNodes[offer.destinationNodeId]) block('schedule-offer-node-reference-missing', path);
    if (offer.isPhysicalServiceRun !== false) block('schedule-offer-interpreted-as-physical-run', path);
    const candidateEvidence = offer.serviceGroupId === 'group_001'
      ? queueTripCandidateEvidence(offer, erp.fleet.queueTrips, erp.routeSequenceVersions)
      : [];
    const exactCandidates = candidateEvidence.filter((candidate) => candidate.exactMatch);
    if (offer.serviceGroupId === 'group_001' && exactCandidates.length === 1) {
      if (offer.mappingStatus !== 'mapped_queue_trip' || offer.queueTripId !== exactCandidates[0].queueTrip.queueTripId) {
        block('uniquely-mappable-offer-unmapped', path, exactCandidates[0].queueTrip.queueTripId);
      }
    } else if (offer.serviceGroupId === 'group_001' && exactCandidates.length === 0 && offer.mappingStatus !== 'estimated_schedule') {
      block('owner-estimated-offer-misclassified', path, offer.mappingStatus);
    } else if (offer.serviceGroupId === 'group_001' && exactCandidates.length > 1 && offer.mappingStatus !== 'needs_review') {
      block('conflicting-candidate-offer-misclassified', path, exactCandidates.length);
    }
    if (offer.mappingStatus === 'mapped_queue_trip') {
      const queueTrip = erp.fleet.queueTrips[offer.queueTripId];
      if (!queueTrip) block('mapped-schedule-offer-queue-trip-missing', path, offer.queueTripId);
      else if (queueTrip.routeSequenceVersionId !== offer.routeSequenceVersionId) block('mapped-schedule-offer-sequence-mismatch', path, offer.routeSequenceVersionId);
      const mappedOriginStopTime = Object.values(erp.stopTimes).find((stopTime) => (
        stopTime.queueTripId === offer.queueTripId &&
        stopTime.groupStopId === (offer.mappingEvidence && offer.mappingEvidence.originGroupStopId) &&
        stopTime.departureTime === offer.departureTime
      ));
      if (!mappedOriginStopTime || mappedOriginStopTime.timeType !== offer.timeType) block('mapped-offer-time-type-mismatch', path, offer.timeType);
      if (!offer.mappingEvidence || offer.mappingEvidence.candidateCount !== 1 || !offer.mappingLineage || !offer.mappingLineage.length) block('mapped-schedule-offer-evidence-missing', path);
    } else if (offer.queueTripId || offer.routeSequenceVersionId || offer.assignmentId || offer.vehicleId) {
      block('unmapped-schedule-offer-has-physical-fields', path);
    }
    if (offer.mappingStatus === 'estimated_schedule') {
      estimatedScheduleSummary.byServiceGroup[offer.serviceGroupId] = (estimatedScheduleSummary.byServiceGroup[offer.serviceGroupId] || 0) + 1;
      if (Object.prototype.hasOwnProperty.call(estimatedScheduleSummary.byTimeType, offer.timeType)) estimatedScheduleSummary.byTimeType[offer.timeType] += 1;
      else estimatedScheduleSummary.byTimeType.unresolved += 1;
      if (offer.timeStatus !== 'owner_estimated') block('estimated-schedule-time-status-invalid', path, offer.timeStatus);
      if (offer.timeType !== 'estimated_pass_through') block('estimated-schedule-time-type-invalid', path, offer.timeType);
      if (offer.referenceOnly !== true) block('estimated-schedule-reference-only-required', path, offer.referenceOnly);
      if (offer.isEstimated !== true || offer.planningEligible !== true) block('estimated-schedule-planning-metadata-invalid', path);
      if (offer.disclaimerKey !== ESTIMATED_TIME_DISCLAIMER_KEY || offer.disclaimerTh !== ESTIMATED_TIME_DISCLAIMER_TH) block('estimated-schedule-disclaimer-missing', path);
      if (!offer.approvalLineage || !offer.approvalLineage.length) block('estimated-schedule-owner-approval-lineage-missing', path);
      if (offer.queueTripId || offer.routeSequenceVersionId || offer.vehicleId || offer.assignmentId || offer.dailyAssignmentId || offer.gps || offer.eta || offer.liveTrackingAvailable === true) block('estimated-schedule-operational-claim', path);
    }
    if (offer.timeType !== 'scheduled_origin_departure' && offer.timeType !== 'estimated_pass_through') block('schedule-offer-time-type-invalid', path, offer.timeType);
    if (offer.primaryTimetableAuthority === true && (offer.timeType !== 'scheduled_origin_departure' || offer.mappingStatus !== 'mapped_queue_trip')) block('schedule-offer-primary-authority-invalid', path);
    if (offer.mappingStatus === 'mapped_queue_trip' && offer.timeType === 'scheduled_origin_departure' && offer.primaryTimetableAuthority !== true) block('mapped-origin-offer-primary-authority-missing', path);
    if (offer.isEstimated === true) {
      if (offer.referenceOnly !== true) block('estimated-offer-reference-only-required', path, offer.referenceOnly);
      if (offer.disclaimerKey !== ESTIMATED_TIME_DISCLAIMER_KEY || !offer.timeSemanticsLineage || !offer.timeSemanticsLineage.length) block('estimated-offer-metadata-missing', path);
      if (offer.guaranteedPickupTime !== false || offer.exactOperationalProof !== false || offer.vehicleId || offer.assignmentId || offer.gps || offer.eta || offer.liveTrackingAvailable === true) block('estimated-offer-operational-claim', path);
    }
    if (offer.mappingStatus === 'needs_review') {
      if (!allowedReviewReasons.has(offer.mappingReasonCode)) block('needs-review-reason-missing-or-invalid', path, offer.mappingReasonCode);
      if (!offer.mappingEvidence || offer.mappingEvidence.reasonCode !== offer.mappingReasonCode) block('needs-review-evidence-missing', path);
    }
  });
  const mappingStatusTotal = Object.values(mappingStatusSummary).reduce((sum, count) => sum + count, 0);
  if (mappingStatusTotal !== TARGET_COUNTS.scheduleOffers) block('mapping-status-total-mismatch', 'data/erpDataCenter/scheduleOffers', mappingStatusTotal);
  Object.keys(EXPECTED_MAPPING_STATUS_BY_GROUP).forEach((groupId) => {
    Object.keys(EXPECTED_MAPPING_STATUS_BY_GROUP[groupId]).forEach((status) => {
      const expected = EXPECTED_MAPPING_STATUS_BY_GROUP[groupId][status];
      const actual = mappingStatusByGroup[groupId][status];
      if (actual !== expected) block('mapping-status-group-count-mismatch', `data/erpDataCenter/scheduleOffers/${groupId}/${status}`, { expected, actual });
    });
  });
  Object.values(erp.routeSequenceVersions).forEach((version) => {
    const expected = ROUTE_SEQUENCE_DEFINITIONS[version.routeSequenceVersionId];
    if (!expected) block('unknown-route-sequence-version', `data/erpDataCenter/routeSequenceVersions/${version.routeSequenceVersionId}`);
    const sequenceNumbers = version.stops.map((stop) => stop.sequence);
    if (new Set(sequenceNumbers).size !== sequenceNumbers.length || sequenceNumbers.some((value, index) => value !== index + 1)) block('route-sequence-gap-or-duplicate', `data/erpDataCenter/routeSequenceVersions/${version.routeSequenceVersionId}`);
    const codes = version.stops.map((stop) => stop.groupStopCode);
    if (expected && codes.join('|') !== expected.join('|')) block('route-sequence-direction-mismatch', `data/erpDataCenter/routeSequenceVersions/${version.routeSequenceVersionId}`);
    version.stops.forEach((stop) => {
      if (!groupStops[stop.groupStopId] || !networkNodes[stop.nodeId]) block('route-sequence-reference-missing', `data/erpDataCenter/routeSequenceVersions/${version.routeSequenceVersionId}`, stop.groupStopId);
    });
  });
  Object.values(erp.tripSequenceAssignments).forEach((assignment) => {
    if (!erp.fleet.queueTrips[assignment.queueTripId]) block('trip-sequence-queue-trip-missing', `data/erpDataCenter/tripSequenceAssignments/${assignment.tripSequenceAssignmentId}`, assignment.queueTripId);
    if (!erp.routeSequenceVersions[assignment.routeSequenceVersionId]) block('trip-sequence-version-missing', `data/erpDataCenter/tripSequenceAssignments/${assignment.tripSequenceAssignmentId}`, assignment.routeSequenceVersionId);
  });
  const stopTimeRoleSummary = { scheduled_origin_departure: 0, estimated_pass_through: 0, estimated_arrival: 0, unresolved: 0 };
  Object.keys(erp.stopTimes).forEach((stopTimeId) => {
    const stopTime = erp.stopTimes[stopTimeId];
    if (!routes[stopTime.routeId]) block('stop-time-route-missing', `data/erpDataCenter/stopTimes/${stopTimeId}`, stopTime.routeId);
    if (!erp.fleet.queueTrips[stopTime.queueTripId]) block('stop-time-queue-trip-missing', `data/erpDataCenter/stopTimes/${stopTimeId}`, stopTime.queueTripId);
    if (stopTime.tripId) block('stop-time-physical-schedule-offer-reference', `data/erpDataCenter/stopTimes/${stopTimeId}`, stopTime.tripId);
    if (!stops[stopTime.stopKey]) block('stop-time-stop-missing', `data/erpDataCenter/stopTimes/${stopTimeId}`, stopTime.stopKey);
    if (!networkNodes[stopTime.nodeId] || !groupStops[stopTime.groupStopId]) block('stop-time-network-reference-missing', `data/erpDataCenter/stopTimes/${stopTimeId}`);
    if (!erp.routeSequenceVersions[stopTime.routeSequenceVersionId]) block('stop-time-sequence-version-missing', `data/erpDataCenter/stopTimes/${stopTimeId}`, stopTime.routeSequenceVersionId);
    const sequenceVersion = erp.routeSequenceVersions[stopTime.routeSequenceVersionId];
    const expectedTimeType = stopTime.sequence === 1
      ? 'scheduled_origin_departure'
      : sequenceVersion && stopTime.sequence === sequenceVersion.stops.length ? 'estimated_arrival' : 'estimated_pass_through';
    if (stopTime.timeType !== expectedTimeType) block('stop-time-role-mismatch', `data/erpDataCenter/stopTimes/${stopTimeId}`, { expected: expectedTimeType, actual: stopTime.timeType });
    const expectedStopRole = stopTime.sequence === 1
      ? 'scheduled_departure_point'
      : sequenceVersion && stopTime.sequence === sequenceVersion.stops.length ? 'destination_endpoint' : 'pass_through_stop';
    if (stopTime.stopRole !== expectedStopRole) block('queue-trip-stop-role-mismatch', `data/erpDataCenter/stopTimes/${stopTimeId}`, { expected: expectedStopRole, actual: stopTime.stopRole });
    if (expectedStopRole === 'pass_through_stop') {
      const basePassThroughInvalid = stopTime.pickupOnDemand !== true || stopTime.stopBehaviors.indexOf('pickup_on_demand') === -1 || stopTime.stopBehaviors.indexOf('pass_through_stop') === -1;
      const ordinaryNoWaitingInvalid = stopTime.conditionalWaitingPoint !== true && (stopTime.noWaitingStop !== true || stopTime.stopBehaviors.indexOf('no_waiting_stop') === -1);
      if (basePassThroughInvalid || ordinaryNoWaitingInvalid) block('pass-through-stop-policy-invalid', `data/erpDataCenter/stopTimes/${stopTimeId}`);
    }
    if (expectedStopRole === 'scheduled_departure_point' && stopTime.stopBehaviors.indexOf('scheduled_departure_point') === -1) block('scheduled-departure-point-policy-invalid', `data/erpDataCenter/stopTimes/${stopTimeId}`);
    if (stopTime.conditionalWaitingPoint === true && (!stopTime.conditionalWaitingApproval || stopTime.stopBehaviors.indexOf('conditional_waiting_point') === -1)) block('conditional-waiting-point-unapproved', `data/erpDataCenter/stopTimes/${stopTimeId}`);
    if (Object.prototype.hasOwnProperty.call(stopTimeRoleSummary, stopTime.timeType)) stopTimeRoleSummary[stopTime.timeType] += 1;
    else stopTimeRoleSummary.unresolved += 1;
    if (stopTime.timeType === 'scheduled_origin_departure') {
      if (stopTime.primaryTimetableAuthority !== true || stopTime.isEstimated !== false) block('origin-stop-time-authority-invalid', `data/erpDataCenter/stopTimes/${stopTimeId}`);
    } else {
      if (stopTime.isEstimated !== true || stopTime.primaryTimetableAuthority !== false) block('estimated-stop-time-authority-invalid', `data/erpDataCenter/stopTimes/${stopTimeId}`);
      if (stopTime.referenceOnly !== true) block('estimated-stop-time-reference-only-required', `data/erpDataCenter/stopTimes/${stopTimeId}`, stopTime.referenceOnly);
      if (stopTime.disclaimerKey !== ESTIMATED_TIME_DISCLAIMER_KEY || !stopTime.timeSemanticsLineage || !stopTime.timeSemanticsLineage.length) block('estimated-stop-time-metadata-missing', `data/erpDataCenter/stopTimes/${stopTimeId}`);
      if (stopTime.guaranteedPickupTime !== false || stopTime.exactOperationalProof !== false || stopTime.gps || stopTime.eta || stopTime.liveTrackingAvailable === true) block('estimated-stop-time-operational-claim', `data/erpDataCenter/stopTimes/${stopTimeId}`);
    }
  });
  Object.keys(EXPECTED_STOP_TIME_ROLES).forEach((timeType) => {
    if (stopTimeRoleSummary[timeType] !== EXPECTED_STOP_TIME_ROLES[timeType]) block('stop-time-role-count-mismatch', `data/erpDataCenter/stopTimes/${timeType}`, { expected: EXPECTED_STOP_TIME_ROLES[timeType], actual: stopTimeRoleSummary[timeType] });
  });
  if (stopTimeRoleSummary.unresolved !== 0) block('stop-time-role-unresolved', 'data/erpDataCenter/stopTimes', stopTimeRoleSummary.unresolved);
  Object.keys(erp.fares).forEach((originKey) => {
    Object.keys(erp.fares[originKey]).forEach((destKey) => {
      if (!destinations[originKey] && !stops[originKey]) warnings.push({ code: 'fare-origin-not-source-stop-or-destination', path: `data/erpDataCenter/fares/${originKey}`, value: originKey });
      if (!destinations[destKey] && !stops[destKey]) warnings.push({ code: 'fare-dest-not-source-stop-or-destination', path: `data/erpDataCenter/fares/${originKey}/${destKey}`, value: destKey });
    });
  });
  Object.values(erp.fleet.queueTrips).forEach((queueTrip) => {
    if (!erp.fleet.queues[queueTrip.queueId]) block('queue-trip-queue-missing', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`, queueTrip.queueId);
    if (!erp.fleet.queueScheduleVersions[queueTrip.queueScheduleVersionId]) block('queue-trip-schedule-version-missing', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`, queueTrip.queueScheduleVersionId);
    if (!erp.routeSequenceVersions[queueTrip.routeSequenceVersionId]) block('queue-trip-sequence-missing', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`, queueTrip.routeSequenceVersionId);
    if (queueTrip.orderedStopTimes.length <= 1) block('singleton-fragment-active-queue-trip', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`);
    const queueStopTimes = Object.values(erp.stopTimes).filter((stopTime) => stopTime.queueTripId === queueTrip.queueTripId);
    if (queueStopTimes.filter((stopTime) => stopTime.timeType === 'scheduled_origin_departure').length !== 1) block('queue-trip-origin-authority-count-invalid', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`);
    if (queueStopTimes.filter((stopTime) => stopTime.timeType === 'estimated_arrival').length !== 1) block('queue-trip-arrival-estimate-count-invalid', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`);
    queueTrip.orderedStopTimes.forEach((orderedStop, index) => {
      const expectedRole = index === 0 ? 'scheduled_departure_point' : index === queueTrip.orderedStopTimes.length - 1 ? 'destination_endpoint' : 'pass_through_stop';
      if (orderedStop.stopRole !== expectedRole) block('queue-trip-ordered-stop-role-mismatch', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}/${index + 1}`, { expected: expectedRole, actual: orderedStop.stopRole });
      if (orderedStop.conditionalWaitingPoint === true && (!orderedStop.conditionalWaitingApproval || orderedStop.stopBehaviors.indexOf('conditional_waiting_point') === -1)) block('queue-trip-conditional-waiting-unapproved', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}/${index + 1}`);
    });
    if (queueTrip.queueId === 'queue_005') {
      if (queueTrip.scheduleOnly !== false) block('queue-005-schedule-only', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`);
      if (queueTrip.assignmentMode !== 'fixed' || queueTrip.vehicleId !== 'veh_005') block('queue-005-invalid-assignment', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`);
      if (queueTrip.liveTrackingAvailable !== false) block('queue-005-fake-live-tracking', `data/erpDataCenter/fleet/queueTrips/${queueTrip.queueTripId}`);
    }
  });
  const fixedRule = erp.fleet.assignmentRules.fixed_queue_005_v1;
  if (!fixedRule || fixedRule.assignmentMode !== 'fixed' || fixedRule.vehicleId !== 'veh_005' || fixedRule.queueId !== 'queue_005') block('queue-005-fixed-rule-missing', 'data/erpDataCenter/fleet/assignmentRules/fixed_queue_005_v1');
  if (erp.settings.readyForApply !== false) block('ready-for-apply-not-false', 'data/erpDataCenter/settings/readyForApply');
  const serialized = JSON.stringify(erp);
  if (/"(?:latitude|longitude|eta|gpsPosition)"\s*:/.test(serialized)) block('fake-gps-or-eta-field', 'data/erpDataCenter');
  const registryValidation = validateStableIdRegistry(erp);
  registryValidation.blockers.forEach((item) => blockers.push(item));
  if (estimatedScheduleSummary.byTimeType.unresolved > 0) block('estimated-schedule-time-type-unresolved', 'data/erpDataCenter/scheduleOffers', estimatedScheduleSummary.byTimeType.unresolved);
  return { blockers, warnings, mappingStatusSummary, mappingStatusByGroup, estimatedScheduleSummary, scheduleOfferTimeTypeSummary, stopTimeRoleSummary };
}

function buildOwnerChecklist(destinations, boardingPoints) {
  const confirmedNodeIds = new Set(Object.values(boardingPoints).map((boardingPoint) => boardingPoint.nodeId));
  return Object.keys(destinations).sort().filter((key) => !confirmedNodeIds.has(destinations[key].nodeId)).map((key) => ({
    destinationId: key,
    displayNameTh: destinations[key].displayNameTh,
    requiredOwnerFields: ['exactBoardingPointName', 'landmark', 'terminalOrQueueName', 'providerName', 'activeInPhase1']
  }));
}

function buildEvidenceContainers(routeData, publishedCatalog) {
  const containers = [];
  Object.keys(routeData.queues || {}).sort((a, b) => Number(a) - Number(b)).forEach((queueKey) => {
    const queue = routeData.queues[queueKey];
    if (!queue || !queue.trips) return;
    Object.keys(queue.trips).sort((a, b) => Number(a) - Number(b)).forEach((tripKey) => {
      const trip = queue.trips[tripKey];
      if (!trip || !Array.isArray(trip.stops) || !trip.stops.length) return;
      containers.push({ sourcePath: `routeData/queues/${queueKey}/trips/${tripKey}`, sourceType: trip.stops.length === 1 ? 'singleton_fragment' : 'complete_legacy_trip' });
    });
  });
  Object.keys(publishedCatalog.stopTimes || {}).sort((a, b) => Number(a) - Number(b)).forEach((containerKey) => {
    const container = publishedCatalog.stopTimes[containerKey];
    if (!container || !Array.isArray(container.stops) || !container.stops.length) return;
    containers.push({ sourcePath: `publishedCatalog/stopTimes/${containerKey}`, sourceType: 'published_corroboration' });
  });
  containers.push(
    { sourcePath: 'owner_decisions/queue_005/morning', sourceType: 'owner_approved_trip' },
    { sourcePath: 'owner_decisions/queue_005/evening', sourceType: 'owner_approved_trip' }
  );
  return containers;
}

async function buildDryRunSnapshot() {
  const [publishedCatalog, routeData, settingsRoutes] = await Promise.all([
    requestJson('publishedCatalog'),
    requestJson('routeData'),
    requestJson('settings/routes')
  ]);
  const activePublishedRoutes = orderedValues(publishedCatalog.routes).filter((route) => !REVIEW_ONLY_ROUTE_IDS.has(route.id));
  const stops = buildStops(routeData);
  const destinations = buildDestinations(activePublishedRoutes, stops);
  const stableIdSourceAudit = auditStableIdSourceEntities(destinations, stops);
  const { networkNodes, groupStops } = buildNetworkModel(destinations, stops);
  const boardingPoints = buildBoardingPoints(stops);
  const serviceGroups = buildServiceGroups(publishedCatalog.routeGroups);
  const serviceGroupAliases = buildServiceGroupAliases();
  const routes = buildRoutes(publishedCatalog, destinations);
  const routeSequenceVersions = buildRouteSequenceVersions(groupStops);
  const tripSequenceAssignments = buildTripSequenceAssignments();
  const { stopTimes, corroboratingRows } = buildStopTimes(routeData, publishedCatalog, groupStops);
  const stopTimeRoleSummary = buildStopTimeRoleSummary(stopTimes);
  const fares = buildFares(publishedCatalog, stops);
  const fareSegments = buildFareSegments(publishedCatalog);
  const transferRules = buildTransferRules(fares);
  const vehicles = buildVehicles();
  const queues = buildQueues();
  const queueTrips = buildQueueTrips(stopTimes);
  const queueScheduleVersions = buildQueueScheduleVersions(queueTrips);
  const scheduleOffers = buildScheduleOffers(publishedCatalog, routes, queueTrips, routeSequenceVersions, stopTimes);
  const mappingReview = buildMappingReview(scheduleOffers, routes);
  const estimatedScheduleSummary = buildEstimatedScheduleSummary(scheduleOffers);
  const assignmentRules = buildAssignmentRules();
  const evidenceContainers = buildEvidenceContainers(routeData, publishedCatalog);
  const closures = publishedCatalog.closures || {};

  const erpDataCenter = {
    settings: {
      schemaVersion: schema.SCHEMA_VERSION,
      ownerFacingName: 'ERP Data Center',
      readyForReview: true,
      readyForApply: false,
      supportedAssignmentModes: ['rotation', 'fixed', 'manual_override'],
      sourceLineage: [buildLineage('owner_decisions/erp_data_center', 'settings', 'Phase 1 dry-run snapshot')]
    },
    destinations,
    networkNodes,
    stops,
    boardingPoints,
    terminals: {},
    providers: {},
    serviceGroups,
    serviceGroupAliases,
    groupStops,
    routes,
    routeSequenceVersions,
    tripSequenceAssignments,
    scheduleOffers,
    stopTimes,
    fares,
    fareSegments,
    transferRules,
    paymentOwnership: buildPaymentOwnership(),
    temporaryClosures: Object.keys(closures).sort().reduce((map, key) => {
      map[key] = Object.assign({}, closures[key], {
        closureId: key,
        sourceLineage: [buildLineage(`publishedCatalog/closures/${key}`, key, 'published closure')]
      });
      return map;
    }, {}),
    serviceFees: {
      platform_service_fee: {
        serviceFeeId: 'platform_service_fee',
        currency: 'THB',
        standardFee: 5,
        trialEnabled: true,
        effectiveFee: 0,
        appliesTo: 'all_service_groups',
        includesExternalPayGroups: true,
        status: 'active',
        sourceLineage: [buildLineage('owner_decisions/service_fee', 'platform_service_fee', 'standard THB 5, trial THB 0')]
      }
    },
    settlementRecipients: {},
    catalog: {
      stops,
      groups: serviceGroups,
      routes: Object.keys(routes).reduce((map, routeId) => {
        const route = routes[routeId];
        if (route.serviceGroupId !== 'group_001') return map;
        map[routeId] = {
          id: routeId,
          routeId,
          fromStopKey: route.fromStopKey,
          toStopKey: route.toStopKey,
          groupId: route.serviceGroupId,
          nameTh: route.displayNameTh
        };
        return map;
      }, {}),
      trips: Object.keys(scheduleOffers).reduce((map, legacyPublishedTripId) => {
        const offer = scheduleOffers[legacyPublishedTripId];
        if (!routes[offer.routeId] || routes[offer.routeId].serviceGroupId !== 'group_001') return map;
        map[legacyPublishedTripId] = {
          id: legacyPublishedTripId,
          recordType: 'schedule_offer',
          compatibilityViewOf: `data/erpDataCenter/scheduleOffers/${legacyPublishedTripId}`,
          legacyPublishedTripId,
          routeId: offer.routeId,
          departTime: offer.departureTime,
          departureTime: offer.departureTime,
          mappingStatus: offer.mappingStatus,
          isPhysicalServiceRun: false
        };
        return map;
      }, {}),
      fares: Object.keys(fares).reduce((map, originKey) => {
        Object.keys(fares[originKey]).forEach((destKey) => {
          const fare = fares[originKey][destKey];
          if (fare.serviceGroupId === TRAIN_GROUP_ID || fare.pricingMode === 'via_chachoengsao') return;
          map[originKey] = map[originKey] || {};
          map[originKey][destKey] = { amount: fare.amount, paymentOwnership: fare.paymentOwnership, routeId: fare.routeId };
        });
        return map;
      }, {}),
      fareSegments: Object.keys(fareSegments).reduce((map, fareSegmentId) => {
        if (fareSegments[fareSegmentId].serviceGroupId !== TRAIN_GROUP_ID) map[fareSegmentId] = fareSegments[fareSegmentId];
        return map;
      }, {}),
      services: serviceGroups,
      stopTimes,
      capacities: publishedCatalog.capacities || {},
      closures
    },
    fleet: {
      vehicles,
      queues,
      queueScheduleVersions,
      queueTrips,
      assignmentRules,
      drivers: {},
      queueOwners: {},
      vehicleLoginIndex: {}
    },
    finance: { transactions: {} },
    providerRegistry: {},
    meta: {
      stableIdRegistry: buildStableIdRegistry(),
      versions: {
        erp_data_center_phase_1_dry_run: {
          versionId: 'erp_data_center_phase_1_dry_run',
          startingSha: STARTING_SHA,
          readyForApply: false,
          status: 'dry_run_review',
          sourceLineage: [buildLineage('ai-handoffs/MAIN-AI-DASHBOARD.md', STARTING_SHA, 'owner-approved Round 2 contract')]
        }
      },
      audit: {
        dry_run_generation: {
          auditId: 'dry_run_generation',
          actor: 'Data Import / ERP Data Center AI',
          mode: 'dry-run',
          firebaseWrites: false,
          seedApplied: false,
          sourceLineage: [
            buildLineage('publishedCatalog', 'publishedCatalog', 'read-only source'),
            buildLineage('routeData', 'routeData', 'read-only source'),
            buildLineage('settings/routes', 'settings/routes', 'read-only source')
          ]
        }
      }
    }
  };

  const plan = {
    dryRun: true,
    writesEnabled: false,
    readyForApply: false,
    generatedAt: new Date(0).toISOString(),
    source: 'erp-data-center-completion-round-2',
    startingSha: STARTING_SHA,
    data: { erpDataCenter }
  };

  const counts = buildCounts(erpDataCenter);
  const importValidation = globalThis.SLTransit.importPlan.validateImportPlan(plan);
  const customValidation = validateReferences(erpDataCenter);
  const validation = {
    readyForReview: importValidation.readyForReview && customValidation.blockers.length === 0,
    readyForApply: false,
    blockers: importValidation.blockers.concat(customValidation.blockers, stableIdSourceAudit.blockers),
    warnings: importValidation.warnings.concat(customValidation.warnings),
    mappingStatusSummary: customValidation.mappingStatusSummary,
    mappingStatusByGroup: customValidation.mappingStatusByGroup,
    estimatedScheduleSummary: customValidation.estimatedScheduleSummary,
    scheduleOfferTimeTypeSummary: customValidation.scheduleOfferTimeTypeSummary,
    stopTimeRoleSummary: customValidation.stopTimeRoleSummary,
    importValidation
  };
  addCountValidation(validation, counts);
  validation.readyForReview = validation.blockers.length === 0;

  const ownerChecklist = buildOwnerChecklist(destinations, boardingPoints);
  const reviewOnlyRoutes = orderedValues(settingsRoutes.main && settingsRoutes.main.routes || {})
    .filter((route) => REVIEW_ONLY_ROUTE_IDS.has(route.routeId || route.id))
    .map((route) => ({
      routeId: route.routeId || route.id,
      from: cleanLabel(route.from),
      to: cleanLabel(route.to),
      fare: route.price || route.fare || null,
      status: 'review_only_unresolved'
    }));

  return {
    plan,
    snapshot: plan.data,
    counts,
    targetCounts: TARGET_COUNTS,
    validation,
    lineage: {
      existingProvenStopTimes: countMap(stopTimes) - 10,
      queue005AddedStopTimes: 10,
      uniqueActiveStopTimes: countMap(stopTimes),
      corroboratingPublishedStopTimeRows: corroboratingRows.length,
      deduplicatedPublishedStopTimeRows: corroboratingRows.length,
      retainedEvidenceContainers: evidenceContainers,
      reviewOnlyRoutes
    },
    ownerChecklist,
    mappingReview,
    estimatedScheduleSummary,
    stopTimeRoleSummary,
    stableIdAllocationProposals: stableIdSourceAudit.proposals
  };
}

if (require.main === module) {
  buildDryRunSnapshot().then((result) => {
    console.log(JSON.stringify({
      startingSha: STARTING_SHA,
      counts: result.counts,
      readyForReview: result.validation.readyForReview,
      readyForApply: result.validation.readyForApply,
      blockers: result.validation.blockers,
      warnings: result.validation.warnings,
      mappingStatusSummary: result.validation.mappingStatusSummary,
      estimatedScheduleSummary: result.estimatedScheduleSummary,
      lineage: result.lineage,
      ownerChecklistCount: result.ownerChecklist.length
    }, null, 2));
  }).catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

module.exports = {
  STARTING_SHA,
  TARGET_COUNTS,
  buildDryRunSnapshot,
  buildStableIdRegistry,
  resolveStableIdFromRegistry,
  validateStableIdRegistry,
  validateReferences,
  keyForLabel,
  cleanLabel
};
