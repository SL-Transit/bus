'use strict';

const REGISTRY_VERSION = 'erp-stable-id-registry-v1';

function record(stableId, entityType, ownerRef, legacyRefs) {
  return Object.freeze({
    stableId,
    entityType,
    ownerRef,
    status: 'active',
    legacyRefs: Object.freeze((legacyRefs || []).slice()),
    createdVersion: REGISTRY_VERSION,
    sourceLineage: Object.freeze([{
      sourceSystem: 'owner_decision',
      sourcePath: 'ai-handoffs/MAIN-AI-DASHBOARD.md',
      sourceId: ownerRef,
      notes: 'Explicit immutable stable ID ownership approved for ERP Data Center Round 2'
    }]),
    retiredMetadata: null
  });
}

// This table is the authority. Order is presentation-only and never allocates IDs.
const OWNER_ENTRIES = Object.freeze({
  'networkNode:000001': record('node_000001', 'networkNode', 'networkNode:000001', ['ao_udom']),
  'networkNode:000002': record('node_000002', 'networkNode', 'networkNode:000002', ['asok']),
  'networkNode:000003': record('node_000003', 'networkNode', 'networkNode:000003', ['ban_chang']),
  'networkNode:000004': record('node_000004', 'networkNode', 'networkNode:000004', ['ban_thap_chang']),
  'networkNode:000005': record('node_000005', 'networkNode', 'networkNode:000005', ['bangkok_hua_lamphong']),
  'networkNode:000006': record('node_000006', 'networkNode', 'networkNode:000006', ['bangna']),
  'networkNode:000007': record('node_000007', 'networkNode', 'networkNode:000007', ['bangsaen']),
  'networkNode:000008': record('node_000008', 'networkNode', 'networkNode:000008', ['bts_bang_chang']),
  'networkNode:000009': record('node_000009', 'networkNode', 'networkNode:000009', ['bts_chatuchak']),
  'networkNode:000010': record('node_000010', 'networkNode', 'networkNode:000010', ['bts_onnut']),
  'networkNode:000011': record('node_000011', 'networkNode', 'networkNode:000011', ['bts_phrakanong']),
  'networkNode:000012': record('node_000012', 'networkNode', 'networkNode:000012', ['chachoengsao']),
  'networkNode:000013': record('node_000013', 'networkNode', 'networkNode:000013', ['ekkamai']),
  'networkNode:000014': record('node_000014', 'networkNode', 'networkNode:000014', ['homepro']),
  'networkNode:000015': record('node_000015', 'networkNode', 'networkNode:000015', ['hua_mak']),
  'networkNode:000016': record('node_000016', 'networkNode', 'networkNode:000016', ['hua_takhe']),
  'networkNode:000017': record('node_000017', 'networkNode', 'networkNode:000017', ['huaisom']),
  'networkNode:000018': record('node_000018', 'networkNode', 'networkNode:000018', ['kasetsart']),
  'networkNode:000019': record('node_000019', 'networkNode', 'networkNode:000019', ['khlong_tan']),
  'networkNode:000020': record('node_000020', 'networkNode', 'networkNode:000020', ['khlongtakien']),
  'networkNode:000021': record('node_000021', 'networkNode', 'networkNode:000021', ['klonghat', 'khlonghat']),
  'networkNode:000022': record('node_000022', 'networkNode', 'networkNode:000022', ['km_1']),
  'networkNode:000023': record('node_000023', 'networkNode', 'networkNode:000023', ['km_10']),
  'networkNode:000024': record('node_000024', 'networkNode', 'networkNode:000024', ['km_7']),
  'networkNode:000025': record('node_000025', 'networkNode', 'networkNode:000025', ['laem_chabang']),
  'networkNode:000026': record('node_000026', 'networkNode', 'networkNode:000026', ['lat_krabang']),
  'networkNode:000027': record('node_000027', 'networkNode', 'networkNode:000027', ['makkasan']),
  'networkNode:000028': record('node_000028', 'networkNode', 'networkNode:000028', ['minburi_market']),
  'networkNode:000029': record('node_000029', 'networkNode', 'networkNode:000029', ['mochit']),
  'networkNode:000030': record('node_000030', 'networkNode', 'networkNode:000030', ['nongkhok']),
  'networkNode:000031': record('node_000031', 'networkNode', 'networkNode:000031', ['nongmon_market']),
  'networkNode:000032': record('node_000032', 'networkNode', 'networkNode:000032', ['nongruea']),
  'networkNode:000033': record('node_000033', 'networkNode', 'networkNode:000033', ['pattaya']),
  'networkNode:000034': record('node_000034', 'networkNode', 'networkNode:000034', ['phaijit']),
  'networkNode:000035': record('node_000035', 'networkNode', 'networkNode:000035', ['phanom']),
  'networkNode:000036': record('node_000036', 'networkNode', 'networkNode:000036', ['phaya_thai']),
  'networkNode:000037': record('node_000037', 'networkNode', 'networkNode:000037', ['phra_chom_klao']),
  'networkNode:000038': record('node_000038', 'networkNode', 'networkNode:000038', ['rangsit']),
  'networkNode:000039': record('node_000039', 'networkNode', 'networkNode:000039', ['rayong']),
  'networkNode:000040': record('node_000040', 'networkNode', 'networkNode:000040', ['sanamchaikhet', 'sanamchai']),
  'networkNode:000041': record('node_000041', 'networkNode', 'networkNode:000041', ['sattahip']),
  'networkNode:000042': record('node_000042', 'networkNode', 'networkNode:000042', ['siyaekkhonom']),
  'networkNode:000043': record('node_000043', 'networkNode', 'networkNode:000043', ['sriracha']),
  'networkNode:000044': record('node_000044', 'networkNode', 'networkNode:000044', ['tatakiab']),
  'networkNode:000045': record('node_000045', 'networkNode', 'networkNode:000045', ['thoengkabintr']),
  'networkNode:000046': record('node_000046', 'networkNode', 'networkNode:000046', ['uruphong']),
  'networkNode:000047': record('node_000047', 'networkNode', 'networkNode:000047', ['wangnamyen']),
  'networkNode:000048': record('node_000048', 'networkNode', 'networkNode:000048', ['yak_aiyakan']),
  'networkNode:000049': record('node_000049', 'networkNode', 'networkNode:000049', ['yak_ladprao']),

  'groupStop:000001': record('gs_000001', 'groupStop', 'groupStop:000001', ['chachoengsao', 'g01p001']),
  'groupStop:000002': record('gs_000002', 'groupStop', 'groupStop:000002', ['phanom', 'g01p002']),
  'groupStop:000003': record('gs_000003', 'groupStop', 'groupStop:000003', ['sanamchaikhet', 'sanamchai', 'g01p003']),
  'groupStop:000004': record('gs_000004', 'groupStop', 'groupStop:000004', ['km_1', 'g01p004']),
  'groupStop:000005': record('gs_000005', 'groupStop', 'groupStop:000005', ['km_7', 'g01p005']),
  'groupStop:000006': record('gs_000006', 'groupStop', 'groupStop:000006', ['huaisom', 'g01p006']),
  'groupStop:000007': record('gs_000007', 'groupStop', 'groupStop:000007', ['tatakiab', 'g01p007']),
  'groupStop:000008': record('gs_000008', 'groupStop', 'groupStop:000008', ['nongkhok', 'g01p008']),
  'groupStop:000009': record('gs_000009', 'groupStop', 'groupStop:000009', ['khlongtakien', 'g01p009']),
  'groupStop:000010': record('gs_000010', 'groupStop', 'groupStop:000010', ['nongruea', 'g01p010']),
  'groupStop:000011': record('gs_000011', 'groupStop', 'groupStop:000011', ['phaijit', 'g01p011']),
  'groupStop:000012': record('gs_000012', 'groupStop', 'groupStop:000012', ['thoengkabintr', 'g01p012']),
  'groupStop:000013': record('gs_000013', 'groupStop', 'groupStop:000013', ['siyaekkhonom', 'g01p013']),
  'groupStop:000014': record('gs_000014', 'groupStop', 'groupStop:000014', ['wangnamyen', 'g01p014']),
  'groupStop:000015': record('gs_000015', 'groupStop', 'groupStop:000015', ['klonghat', 'khlonghat', 'g01p015']),

  'boardingPoint:000001': record('bp_000001', 'boardingPoint', 'boardingPoint:000001', ['chachoengsao']),
  'boardingPoint:000002': record('bp_000002', 'boardingPoint', 'boardingPoint:000002', ['phanom']),
  'boardingPoint:000003': record('bp_000003', 'boardingPoint', 'boardingPoint:000003', ['sanamchaikhet', 'sanamchai']),
  'boardingPoint:000004': record('bp_000004', 'boardingPoint', 'boardingPoint:000004', ['km_1']),
  'boardingPoint:000005': record('bp_000005', 'boardingPoint', 'boardingPoint:000005', ['km_7']),
  'boardingPoint:000006': record('bp_000006', 'boardingPoint', 'boardingPoint:000006', ['huaisom']),
  'boardingPoint:000007': record('bp_000007', 'boardingPoint', 'boardingPoint:000007', ['tatakiab']),
  'boardingPoint:000008': record('bp_000008', 'boardingPoint', 'boardingPoint:000008', ['nongkhok']),
  'boardingPoint:000009': record('bp_000009', 'boardingPoint', 'boardingPoint:000009', ['khlongtakien']),
  'boardingPoint:000010': record('bp_000010', 'boardingPoint', 'boardingPoint:000010', ['nongruea']),
  'boardingPoint:000011': record('bp_000011', 'boardingPoint', 'boardingPoint:000011', ['phaijit']),
  'boardingPoint:000012': record('bp_000012', 'boardingPoint', 'boardingPoint:000012', ['thoengkabintr']),
  'boardingPoint:000013': record('bp_000013', 'boardingPoint', 'boardingPoint:000013', ['siyaekkhonom']),
  'boardingPoint:000014': record('bp_000014', 'boardingPoint', 'boardingPoint:000014', ['wangnamyen']),
  'boardingPoint:000015': record('bp_000015', 'boardingPoint', 'boardingPoint:000015', ['klonghat', 'khlonghat']),

  'routeSequenceVersion:000001': record('rsv_000001', 'routeSequenceVersion', 'routeSequenceVersion:000001', []),
  'routeSequenceVersion:000002': record('rsv_000002', 'routeSequenceVersion', 'routeSequenceVersion:000002', []),
  'routeSequenceVersion:000003': record('rsv_000003', 'routeSequenceVersion', 'routeSequenceVersion:000003', []),
  'routeSequenceVersion:000004': record('rsv_000004', 'routeSequenceVersion', 'routeSequenceVersion:000004', []),
  'routeSequenceVersion:000005': record('rsv_000005', 'routeSequenceVersion', 'routeSequenceVersion:000005', []),
  'routeSequenceVersion:000006': record('rsv_000006', 'routeSequenceVersion', 'routeSequenceVersion:000006', []),

  'queueTrip:000001': record('qt_000001', 'queueTrip', 'queueTrip:000001', ['TRIP-ROUTE-MAIN-004-0900']),
  'queueTrip:000002': record('qt_000002', 'queueTrip', 'queueTrip:000002', ['TRIP-ROUTE-MAIN-021-1120']),
  'queueTrip:000003': record('qt_000003', 'queueTrip', 'queueTrip:000003', ['TRIP-ROUTE-MAIN-022-0800']),
  'queueTrip:000004': record('qt_000004', 'queueTrip', 'queueTrip:000004', ['TRIP-ROUTE-MAIN-003-1220']),
  'queueTrip:000005': record('qt_000005', 'queueTrip', 'queueTrip:000005', ['TRIP-ROUTE-MAIN-004-1340']),
  'queueTrip:000006': record('qt_000006', 'queueTrip', 'queueTrip:000006', ['TRIP-ROUTE-MAIN-003-1520']),
  'queueTrip:000007': record('qt_000007', 'queueTrip', 'queueTrip:000007', ['TRIP-ROUTE-MAIN-004-0620']),
  'queueTrip:000008': record('qt_000008', 'queueTrip', 'queueTrip:000008', ['TRIP-ROUTE-MAIN-003-0940']),
  'queueTrip:000009': record('qt_000009', 'queueTrip', 'queueTrip:000009', ['TRIP-ROUTE-MAIN-004-1210']),
  'queueTrip:000010': record('qt_000010', 'queueTrip', 'queueTrip:000010', ['TRIP-ROUTE-MAIN-021-1400']),
  'queueTrip:000011': record('qt_000011', 'queueTrip', 'queueTrip:000011', ['TRIP-ROUTE-MAIN-022-1130']),
  'queueTrip:000012': record('qt_000012', 'queueTrip', 'queueTrip:000012', ['TRIP-ROUTE-MAIN-003-1620']),
  'queueTrip:000013': record('qt_000013', 'queueTrip', 'queueTrip:000013', ['TRIP-ROUTE-MAIN-008_1-0620']),
  'queueTrip:000014': record('qt_000014', 'queueTrip', 'queueTrip:000014', ['TRIP-ROUTE-MAIN-007_1-1720']),

  'tripSequenceAssignment:000001': record('tsa_000001', 'tripSequenceAssignment', 'tripSequenceAssignment:000001', []),
  'tripSequenceAssignment:000002': record('tsa_000002', 'tripSequenceAssignment', 'tripSequenceAssignment:000002', []),
  'tripSequenceAssignment:000003': record('tsa_000003', 'tripSequenceAssignment', 'tripSequenceAssignment:000003', []),
  'tripSequenceAssignment:000004': record('tsa_000004', 'tripSequenceAssignment', 'tripSequenceAssignment:000004', []),
  'tripSequenceAssignment:000005': record('tsa_000005', 'tripSequenceAssignment', 'tripSequenceAssignment:000005', []),
  'tripSequenceAssignment:000006': record('tsa_000006', 'tripSequenceAssignment', 'tripSequenceAssignment:000006', []),
  'tripSequenceAssignment:000007': record('tsa_000007', 'tripSequenceAssignment', 'tripSequenceAssignment:000007', []),
  'tripSequenceAssignment:000008': record('tsa_000008', 'tripSequenceAssignment', 'tripSequenceAssignment:000008', []),
  'tripSequenceAssignment:000009': record('tsa_000009', 'tripSequenceAssignment', 'tripSequenceAssignment:000009', []),
  'tripSequenceAssignment:000010': record('tsa_000010', 'tripSequenceAssignment', 'tripSequenceAssignment:000010', []),
  'tripSequenceAssignment:000011': record('tsa_000011', 'tripSequenceAssignment', 'tripSequenceAssignment:000011', []),
  'tripSequenceAssignment:000012': record('tsa_000012', 'tripSequenceAssignment', 'tripSequenceAssignment:000012', []),
  'tripSequenceAssignment:000013': record('tsa_000013', 'tripSequenceAssignment', 'tripSequenceAssignment:000013', []),
  'tripSequenceAssignment:000014': record('tsa_000014', 'tripSequenceAssignment', 'tripSequenceAssignment:000014', []),

  'queueScheduleVersion:000001': record('qsv_000001', 'queueScheduleVersion', 'queueScheduleVersion:000001', []),
  'queueScheduleVersion:000002': record('qsv_000002', 'queueScheduleVersion', 'queueScheduleVersion:000002', []),
  'queueScheduleVersion:000003': record('qsv_000003', 'queueScheduleVersion', 'queueScheduleVersion:000003', []),
  'queueScheduleVersion:000004': record('qsv_000004', 'queueScheduleVersion', 'queueScheduleVersion:000004', []),
  'queueScheduleVersion:000005': record('qsv_000005', 'queueScheduleVersion', 'queueScheduleVersion:000005', [])
});

const NEXT_SEQUENCES = Object.freeze({
  networkNode: 50,
  groupStop: 16,
  boardingPoint: 16,
  routeSequenceVersion: 7,
  queueTrip: 15,
  tripSequenceAssignment: 15,
  queueScheduleVersion: 6
});

const PREFIXES = Object.freeze({
  networkNode: 'node',
  groupStop: 'gs',
  boardingPoint: 'bp',
  routeSequenceVersion: 'rsv',
  queueTrip: 'qt',
  tripSequenceAssignment: 'tsa',
  queueScheduleVersion: 'qsv'
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildRegistry() {
  const entries = Object.values(OWNER_ENTRIES).reduce((map, entry) => {
    map[entry.stableId] = clone(entry);
    return map;
  }, {});
  return {
    authorityVersion: REGISTRY_VERSION,
    allocationPolicy: 'append_only_explicit_no_reuse',
    nextSequences: clone(NEXT_SEQUENCES),
    retiredIds: {},
    entries
  };
}

function resolveByOwnerRef(registry, entityType, ownerRef) {
  const matches = Object.values(registry && registry.entries || {}).filter((entry) => entry.entityType === entityType && entry.ownerRef === ownerRef);
  return matches.length === 1 ? matches[0].stableId : null;
}

function resolveByLegacyRef(registry, entityType, legacyRef) {
  const matches = Object.values(registry && registry.entries || {}).filter((entry) => entry.entityType === entityType && (entry.legacyRefs || []).indexOf(legacyRef) !== -1);
  return matches.length === 1 ? matches[0].stableId : null;
}

function proposedNextId(registry, entityType) {
  const prefix = PREFIXES[entityType];
  const next = registry && registry.nextSequences && registry.nextSequences[entityType];
  return prefix && Number.isInteger(next) ? `${prefix}_${String(next).padStart(6, '0')}` : null;
}

function auditRequests(registry, requests) {
  const blockers = [];
  const proposals = [];
  (requests || []).forEach((request) => {
    const stableId = request.ownerRef
      ? resolveByOwnerRef(registry, request.entityType, request.ownerRef)
      : resolveByLegacyRef(registry, request.entityType, request.legacyRef);
    if (stableId) return;
    blockers.push({
      level: 'blocker',
      code: 'unregistered_stable_id',
      entityType: request.entityType,
      ownerRef: request.ownerRef || null,
      legacyRef: request.legacyRef || null
    });
    proposals.push({
      reviewOnly: true,
      persistAutomatically: false,
      entityType: request.entityType,
      proposedStableId: proposedNextId(registry, request.entityType),
      requestedOwnerRef: request.ownerRef || null,
      requestedLegacyRef: request.legacyRef || null
    });
  });
  return { blockers, proposals };
}

module.exports = {
  REGISTRY_VERSION,
  OWNER_ENTRIES,
  buildRegistry,
  resolveByOwnerRef,
  resolveByLegacyRef,
  proposedNextId,
  auditRequests
};
