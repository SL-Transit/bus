#!/usr/bin/env node
'use strict';

const { buildDryRunSnapshot, OWNER_WORKBOOK_STOPS } = require('./erp-data-center-dry-run-snapshot.js');
const ROAD_POLYLINE_POINTS = require('./published-schedule-map-road-polyline.json');

const ESTIMATED_BADGE_TH = 'เวลาโดยประมาณ';
const ESTIMATED_DISCLAIMER_KEY = 'estimated_travel_time_may_change';
const ESTIMATED_DISCLAIMER_TH = 'เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง';
const TRANSFER_UNKNOWN_DISCLAIMER_KEY = 'transfer_feasibility_not_confirmed';
const TRANSFER_UNKNOWN_DISCLAIMER_TH = 'ข้อมูลต่อรถเป็นข้อมูลอ้างอิง ต้องยืนยันจุดต่อรถและความพร้อมให้บริการก่อนใช้งานจริง';
const TRANSFER_REFERENCE_BADGE_TH = '\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e15\u0e48\u0e2d\u0e23\u0e16\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07';
const TRANSFER_REFERENCE_DISCLAIMER_KEY = 'transfer_reference_confirm_before_travel';
const TRANSFER_REFERENCE_DISCLAIMER_TH = '\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e15\u0e48\u0e2d\u0e23\u0e16\u0e40\u0e1b\u0e47\u0e19\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07 \u0e15\u0e49\u0e2d\u0e07\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e08\u0e38\u0e14\u0e15\u0e48\u0e2d\u0e23\u0e16\u0e41\u0e25\u0e30\u0e04\u0e27\u0e32\u0e21\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e43\u0e2b\u0e49\u0e1a\u0e23\u0e34\u0e01\u0e32\u0e23\u0e01\u0e48\u0e2d\u0e19\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19\u0e08\u0e23\u0e34\u0e07';
const TRANSFER_POLICY = {
  minTransferMinutes: 15,
  idealWaitMinutes: 30,
  maxRecommendedWaitMinutes: 60,
  sourceWorkbook: 'SL-Transit_ทั้งหมด_20260627.xlsx',
  policySheetName: '02_กลุ่มเส้นทาง',
  policySheetRows: '2-6',
  queueTimesSheetName: '05_คิวรถและเวลา'
};
const OWNER_WORKBOOK_INTERPRETATION = {
  sourceWorkbook: 'SL-Transit_\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14_20260712.xlsx',
  sheets: {
    stops: '01_\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e1b\u0e49\u0e32\u0e22\u0e01\u0e25\u0e32\u0e07',
    routeGroups: '02_\u0e01\u0e25\u0e38\u0e48\u0e21\u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07',
    routesAndPrices: '03_\u0e40\u0e2a\u0e49\u0e19\u0e17\u0e32\u0e07\u0e41\u0e25\u0e30\u0e23\u0e32\u0e04\u0e32',
    timetable: '04_\u0e23\u0e2d\u0e1a\u0e40\u0e27\u0e25\u0e32',
    queueTimes: '05_\u0e04\u0e34\u0e27\u0e23\u0e16\u0e41\u0e25\u0e30\u0e40\u0e27\u0e25\u0e32',
    vehiclesAndQueues: '06_\u0e23\u0e16\u0e41\u0e25\u0e30\u0e04\u0e34\u0e27'
  },
  stopSequence: {
    stopCountPolicy: 'route_sequence_version_dynamic',
    currentRouteSequenceVersionId: 'owner_workbook_20260712_current_corridor',
    requireNewRouteSequenceVersionOnStopChange: true,
    neverRewriteHistoricalRouteSequences: true,
    perOriginDestinationRowsFormula: 'activeStopCount - 1',
    dependentRegenerationTargets: [
      'origin_bucket_rows',
      'route_price_matrix',
      'timetable_rows',
      'queue_stop_sequences',
      'pass_through_estimates',
      'booking_restrictions',
      'fare_segments',
      'publishedSchedule_pairs'
    ]
  },
  routeIdentity: {
    sheet03RouteIdSemantics: 'origin_bucket_origin_stop_code',
    duplicateOriginBucketCodesAllowed: true,
    duplicateOriginBucketsAllowedOnlyWhenDestinationKeyDiffers: true,
    uniqueOdIdentityFields: ['originBucketCode', 'originStopKey', 'destinationKey'],
    routeIdIsUniqueOdId: false
  },
  bookingAvailability: {
    defaultWhenBlank: 'open',
    blankMeansClosed: false,
    explicitRestrictionsOnly: true,
    restrictions: [
      {
        queueCode: 'Q_001',
        departureTime: '11:20',
        direction: 'chachoengsao_to_klonghat',
        closeBookingDestinationStopKeys: ['phanom', 'sanamchaikhet', 'km_1']
      },
      {
        queueCode: 'Q_002',
        direction: 'klonghat_to_chachoengsao',
        closeBookingDestinationStopKeys: ['sanamchaikhet', 'phanom', 'km_1', 'km_7']
      }
    ],
    specialOverrides: {
      wangNamYen: {
        bookingEligible: false,
        overrideWorkbookOpen: true,
        reason: 'owner_not_enabled_yet'
      }
    }
  },
  transferPolicy: {
    globalTransferHub: null,
    globalTransferHubAllowed: false,
    transferNodeScope: 'per_journey_candidate',
    explicitTransferNodeRequired: true,
    chachoengsaoOnlyWhenEvidenceSupports: true,
    feasibleTransfersBookingEligible: false,
    feasibleTransfersDisplayMode: 'transfer_reference'
  },
  queueCodeInterpretation: {
    numericQueueCodeMap: {
      '1': 'Q_001',
      '2': 'Q_002',
      '3': 'Q_003',
      '4': 'Q_004',
      '5': 'Q_005'
    },
    queueTripCanonicalPattern: 'G_001-Q_001-T_001',
    q005Sheet05Evidence: false,
    q005FallbackPolicy: {
      source: 'owner_approved_policy',
      directSheet05Evidence: false,
      trips: [
        { direction: 'nongkhok_to_chachoengsao', departureTime: '06:20' },
        { direction: 'chachoengsao_to_nongkhok', departureTime: '17:20' }
      ]
    }
  },
  vehicleDriverLogin: {
    previewOnly: true,
    vehicleIdsArePreviewMasterData: true,
    rotationVehicles: ['V_001', 'V_002', 'V_003', 'V_004'],
    fixedVehicleAssignments: [{ vehicleCode: 'V_005', queueCode: 'Q_005' }],
    provisionalDriverCodes: ['D_001', 'D_002', 'D_003', 'D_004', 'D_005'],
    loginAndTemporaryPasswordUse: 'workbook_test_preview_only',
    productionCredentialUseAllowed: false,
    createProductionCredentials: false,
    createBankOrSettlementRecords: false
  }
};
TRANSFER_POLICY.sourceWorkbook = OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook;
const EXTERNAL_SERVICE_DISCLAIMER_KEY = 'external_service_confirm_outside_sl_transit';
const EXTERNAL_SERVICE_DISCLAIMER_TH = 'บริการหรือค่าโดยสารนี้ต้องชำระหรือยืนยันภายนอกระบบ SL-Transit';
const FORBIDDEN_OPERATIONAL_FIELDS = ['gps', 'eta', 'vehicleId', 'assignmentId', 'liveVehicleId', 'liveTrackingAvailable', 'driverId'];
const PREVIEW_MAP_COORDINATES = Object.keys(OWNER_WORKBOOK_STOPS).reduce((map, stopKey) => {
  map[stopKey] = { lat: OWNER_WORKBOOK_STOPS[stopKey].lat, lng: OWNER_WORKBOOK_STOPS[stopKey].lng };
  return map;
}, {});
const OWNER_WORKBOOK_STOP_ICONS = Object.keys(OWNER_WORKBOOK_STOPS).reduce((map, stopKey) => {
  const source = OWNER_WORKBOOK_STOPS[stopKey];
  map[stopKey] = { icon: source.icon, workbookStopKey: source.workbookStopKey, row: source.row };
  return map;
}, {});
const ROAD_POLYLINE_SOURCE = {
  sourceSystem: 'osrm_public_route_snapshot',
  sourcePath: 'tools/published-schedule-map-road-polyline.json',
  sourceId: 'group_001_corridor_osrm_20260715_owner_workbook_stops',
  importedBy: 'published-schedule-v1-dry-run',
  notes: 'road-following preview geometry generated from owner workbook Sheet 01 stop lat/lng; reference-only map shape, not GPS, ETA, vehicle, or operational proof'
};

function values(map) {
  return Object.keys(map || {}).map((key) => map[key]);
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildOwnerWorkbookInterpretation(activeStopCount) {
  const interpretation = clonePlain(OWNER_WORKBOOK_INTERPRETATION);
  interpretation.stopSequence.currentActiveStopCount = activeStopCount;
  interpretation.stopSequence.currentExpectedDestinationsPerOrigin = Math.max(0, activeStopCount - 1);
  return interpretation;
}

function compatibilityPairKey(originLabel, destinationLabel) {
  return `${originLabel}__${destinationLabel}`;
}

function scheduledCanonicalPairKey(offer) {
  return `psv1_pair_node_${offer.originNodeId}_to_${offer.destinationNodeId}`;
}

function transferCanonicalPairKey(rule) {
  return `psv1_pair_dest_${rule.originStopKey}_to_${rule.destStopKey}_via_${rule.viaStopKey}`;
}

function unavailableReferenceCanonicalPairKey(originDestinationId, destinationId) {
  return `psv1_pair_dest_${originDestinationId}_to_${destinationId}_unavailable_reference`;
}

function timeToMinutes(time) {
  const match = /^(\d\d?):(\d\d)$/.exec(String(time || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function lineagePaths(items) {
  return values(items).reduce((paths, item) => {
    (item && item.sourceLineage || []).forEach((lineage) => {
      if (lineage && lineage.sourcePath && paths.indexOf(lineage.sourcePath) === -1) paths.push(lineage.sourcePath);
    });
    return paths;
  }, []);
}

function transferPolicyEvidence() {
  return {
    workbook: OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook,
    sheet: TRANSFER_POLICY.policySheetName,
    rows: TRANSFER_POLICY.policySheetRows,
    minTransferMinutes: TRANSFER_POLICY.minTransferMinutes,
    idealWaitMinutes: TRANSFER_POLICY.idealWaitMinutes,
    maxRecommendedWaitMinutes: TRANSFER_POLICY.maxRecommendedWaitMinutes
  };
}

function previewMapSourceLineage(stopKey, stop) {
  return [
    {
      sourceSystem: 'erp_preview_contract',
      sourcePath: `data/erpDataCenter/groupStops/${stop.groupStopId}`,
      sourceId: stop.groupStopId,
      importedBy: 'published-schedule-v1-dry-run',
      notes: 'ERP Map stop identity, coordinates, icon, and display order come from ERP Data Center'
    }
  ].concat(stop.sourceLineage || []);
}


function buildMapView(erp) {
  const stopsByGroupStopId = values(erp.stops).reduce((map, stop) => {
    if (stop.groupStopId) map[stop.groupStopId] = stop;
    return map;
  }, {});
  const corridorStops = values(erp.groupStops)
    .filter((stop) => stop.serviceGroupId === 'group_001' && stop.status === 'active')
    .sort((a, b) => Number(a.corridorPosition) - Number(b.corridorPosition));
  const stops = corridorStops.map((groupStop, index) => {
    const stop = stopsByGroupStopId[groupStop.groupStopId] || {};
    const stopKey = stop.stopKey || groupStop.workbookStopKey || (groupStop.sourceLineage && groupStop.sourceLineage[0] && groupStop.sourceLineage[0].sourceId) || groupStop.groupStopCode;
    const lat = Number(groupStop.lat);
    const lng = Number(groupStop.lng);
    return {
      stopKey,
      nodeId: groupStop.nodeId,
      groupStopId: groupStop.groupStopId,
      groupStopCode: groupStop.groupStopCode,
      label: groupStop.displayNameTh || stop.displayNameTh || stop.nameTh || stopKey,
      displayOrder: index,
      lat,
      lng,
      icon: groupStop.icon || stop.icon,
      visible: Number.isFinite(lat) && Number.isFinite(lng),
      previewDisplayMode: 'static_map_reference',
      referenceOnly: true,
      sourceLineage: previewMapSourceLineage(stopKey, groupStop)
    };
  });
  const fallbackPolyline = stops
    .filter((stop) => Number.isFinite(Number(stop.lat)) && Number.isFinite(Number(stop.lng)))
    .map((stop) => ({ lat: stop.lat, lng: stop.lng }));
  const roadPolyline = (Array.isArray(ROAD_POLYLINE_POINTS) ? ROAD_POLYLINE_POINTS : [])
    .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  const hasRoadPolyline = roadPolyline.length > fallbackPolyline.length;
  const polyline = hasRoadPolyline ? roadPolyline : fallbackPolyline;
  return {
    schemaVersion: 'publishedSchedule.mapView.v1.preview',
    previewDisplayMode: 'static_map_reference',
    referenceOnly: true,
    routeLineSource: hasRoadPolyline ? 'imported_road_polyline_reference' : 'derived_from_ordered_preview_stops',
    operationalProof: false,
    gps: false,
    eta: false,
    liveVehicleMarkers: false,
    stops,
    routes: [
      {
        routeViewId: 'map_route_group_001_corridor_preview',
        serviceGroupId: 'group_001',
        direction: 'corridor_display_order',
        geometryType: hasRoadPolyline ? 'road_polyline' : 'stop_to_stop_fallback',
        stopKeys: stops.map((stop) => stop.stopKey),
        polyline,
        previewDisplayMode: 'static_map_reference',
        referenceOnly: true,
        operationalProof: false,
        sourceLineage: [
          ...(hasRoadPolyline ? [ROAD_POLYLINE_SOURCE] : []),
          {
            sourceSystem: 'erp_preview_contract',
            sourcePath: 'publishedSchedule/mapView/stops',
            sourceId: 'group_001_corridor_display_order',
            importedBy: 'published-schedule-v1-dry-run',
            notes: hasRoadPolyline
              ? 'stop order anchors the imported road polyline for Passenger Preview'
              : 'preview route line derived from ordered static stops; fallback only, not owner-approved road geometry, GPS, ETA, or operational proof'
          }
        ]
      }
    ]
  };
}

function queueTripSource(queueTrip) {
  if (!queueTrip) return null;
  const sourcePath = (queueTrip.sourceLineage || [])
    .map((lineage) => lineage.sourcePath || '')
    .find((path) => /^routeData\/queues\/\d+\/trips\/\d+$/.test(path));
  if (!sourcePath) return null;
  const match = /^routeData\/queues\/(\d+)\/trips\/(\d+)$/.exec(sourcePath);
  return {
    sourcePath,
    queue: Number(match[1]),
    trip: Number(match[2])
  };
}

function workbookRowForStopTime(erp, queueTrip, stopTime) {
  const source = queueTripSource(queueTrip);
  if (!source || !stopTime) return null;
  const priorStopRows = values(erp.fleet && erp.fleet.queueTrips || {}).reduce((total, candidate) => {
    const candidateSource = queueTripSource(candidate);
    if (!candidateSource) return total;
    if (candidateSource.queue < source.queue || (candidateSource.queue === source.queue && candidateSource.trip < source.trip)) {
      return total + (candidate.orderedStopTimes || []).length;
    }
    return total;
  }, 0);
  return 2 + priorStopRows + Math.max(0, Number(stopTime.sequence || 1) - 1);
}

function queueTripWorkbookEvidence(erp, queueTrip, stopTime) {
  if (!queueTrip || !stopTime) return null;
  const source = queueTripSource(queueTrip);
  if (!source) return null;
  return {
    workbook: OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook,
    sheet: TRANSFER_POLICY.queueTimesSheetName,
    row: workbookRowForStopTime(erp, queueTrip, stopTime),
    sourcePath: `${source.sourcePath}/stops/${Math.max(0, Number(stopTime.sequence || 1) - 1)}`,
    queue: String(source.queue),
    trip: String(source.trip),
    sequence: stopTime.sequence,
    stopKey: stopTime.stopKey,
    time: stopTime.departureTime || stopTime.arrivalTime
  };
}

function buildOriginSort(erp) {
  const orderByNodeId = {};
  values(erp.groupStops).forEach((groupStop) => {
    if (groupStop.serviceGroupId !== 'group_001') return;
    orderByNodeId[groupStop.nodeId] = groupStop.corridorPosition;
  });
  return function sortOrigins(a, b) {
    const ai = orderByNodeId[a.nodeId] || 999999;
    const bi = orderByNodeId[b.nodeId] || 999999;
    return ai - bi || a.displayNameTh.localeCompare(b.displayNameTh, 'th');
  };
}

function displayGroupForDestination(destination, serviceGroups) {
  if (!destination || !Array.isArray(destination.serviceGroupIds)) return null;
  if (destination.serviceGroupIds.indexOf('group_001') !== -1) return null;
  const groupId = destination.serviceGroupIds[0];
  if (groupId === 'group_005') return 'สถานีรถไฟ';
  const group = serviceGroups[groupId];
  return group && (group.displayNameTh || group.nameTh || group.serviceGroupId) || groupId || null;
}

function buildDestinationOrder(erp, destinationList) {
  const corridorOrderByNodeId = {};
  values(erp.groupStops).forEach((groupStop) => {
    if (groupStop.serviceGroupId === 'group_001') corridorOrderByNodeId[groupStop.nodeId] = groupStop.corridorPosition;
  });
  const groupOrder = {
    group_001: 0,
    group_002: 10000,
    group_003: 20000,
    group_004: 30000,
    group_005: 40000
  };
  return destinationList.reduce((map, destination, index) => {
    const groupId = Array.isArray(destination.serviceGroupIds) && destination.serviceGroupIds[0] || 'group_999';
    const corridorOrder = corridorOrderByNodeId[destination.nodeId];
    map[destination.destinationId] = Number.isFinite(Number(corridorOrder))
      ? Number(corridorOrder)
      : (groupOrder[groupId] || 90000) + index;
    return map;
  }, {});
}

function destinationOptionFromPair(pair, destination, destinations, displayOrder) {
  const destinationEntry = destinations[pair.destinationLabel] || {};
  return {
    label: pair.destinationLabel,
    destinationLabel: pair.destinationLabel,
    destinationId: pair.destinationId,
    nodeId: pair.destinationNodeId || destination && destination.nodeId || destinationEntry.nodeId || null,
    group: destinationEntry.group || null,
    displayOrder,
    visible: true,
    pairKey: pair.compatibilityPairKey,
    canonicalPairKey: pair.canonicalPairKey,
    routeChoiceStatus: pair.routeChoiceStatus,
    previewDisplayMode: pair.previewDisplayMode,
    referenceOnly: pair.referenceOnly === true,
    transferStatus: pair.transferStatus || 'not_required',
    externalReference: pair.externalReference === true,
    displayBadgeTh: pair.displayBadgeTh || null,
    fareAmount: pair.fareAmount,
    currency: pair.currency || 'THB',
    paymentOwnership: pair.paymentOwnership || null,
    externalPaymentRequired: pair.externalPaymentRequired === true,
    fareSegmentId: pair.fareSegmentId || null
  };
}

function buildOriginOptions(originDestinations) {
  return originDestinations.map((destination, index) => ({
    label: destination.displayNameTh,
    originLabel: destination.displayNameTh,
    originDestinationId: destination.destinationId,
    nodeId: destination.nodeId,
    displayOrder: index,
    visible: true
  }));
}

function buildDestinationOptionsByOrigin(originOptions, pairs, destinationsById, destinations, destinationOrderById) {
  const optionMaps = {};
  values(pairs).forEach((pair) => {
    const originOption = originOptions.find((origin) => origin.originDestinationId === pair.originDestinationId);
    if (!originOption || pair.originLabel === pair.destinationLabel) return;
    const destination = destinationsById[pair.destinationId] || null;
    const displayOrder = destinationOrderById[pair.destinationId] == null ? 999999 : destinationOrderById[pair.destinationId];
    const option = destinationOptionFromPair(pair, destination, destinations, displayOrder);
    optionMaps[originOption.originLabel] = optionMaps[originOption.originLabel] || {};
    optionMaps[originOption.originLabel][option.pairKey] = option;
  });
  return originOptions.reduce((map, origin) => {
    const options = values(optionMaps[origin.originLabel] || {})
      .sort((a, b) => a.displayOrder - b.displayOrder || String(a.label).localeCompare(String(b.label), 'th'))
      .map((option, index) => Object.assign({}, option, { displayOrder: index }));
    map[origin.originLabel] = options;
    return map;
  }, {});
}

function buildUnavailableReferencePair(origin, destination) {
  const pairKey = compatibilityPairKey(origin.originLabel, destination.originLabel);
  const canonicalPairKey = unavailableReferenceCanonicalPairKey(origin.originDestinationId, destination.originDestinationId);
  return {
    pairId: canonicalPairKey,
    canonicalPairKey,
    compatibilityPairKey: pairKey,
    keyType: 'compatibility_label_pair',
    compatibilityOnly: true,
    originLabel: origin.originLabel,
    destinationLabel: destination.originLabel,
    originDestinationId: origin.originDestinationId,
    destinationId: destination.originDestinationId,
    originNodeId: origin.nodeId,
    destinationNodeId: destination.nodeId,
    serviceGroupId: 'group_001',
    previewPriority: 'phase1_owner_review',
    publicationStatus: 'preview',
    productionReady: false,
    bookingEligible: false,
    referenceOnly: true,
    previewDisplayMode: 'reference_unavailable',
    routeChoiceStatus: 'unavailable_reference',
    unavailableReasonCode: 'missing_group_001_timetable_pair',
    transfer: null,
    transferStatus: 'not_required',
    transferDisclaimerKey: null,
    transferDisclaimerTh: null,
    transferRuleId: null,
    segments: [
      {
        label: 'ตารางเวลา',
        fromLabel: origin.originLabel,
        toLabel: destination.originLabel,
        note: 'ยังไม่มีตารางเวลาสำหรับคู่ป้ายนี้ในข้อมูลกลาง',
        referenceOnly: true,
        unavailable: true,
        availabilityStatus: 'unavailable_reference',
        routeChoiceStatus: 'unavailable_reference',
        times: []
      }
    ],
    sourceLineage: []
  };
}

function addMissingGroupOneDestinationPairs(originOptions, pairs) {
  originOptions.forEach((origin) => {
    originOptions.forEach((destination) => {
      if (origin.originDestinationId === destination.originDestinationId) return;
      const pairKey = compatibilityPairKey(origin.originLabel, destination.originLabel);
      if (pairs[pairKey]) return;
      pairs[pairKey] = buildUnavailableReferencePair(origin, destination);
    });
  });
}

function resolveFareContract(erp, offer) {
  const directFare = erp.fares &&
    erp.fares[offer.originDestinationId] &&
    erp.fares[offer.originDestinationId][offer.destinationId] || null;
  const routeFare = offer.routeId && erp.fareSegments && erp.fareSegments[offer.routeId] || null;
  const fare = directFare || routeFare || null;
  if (!fare) return null;
  const amount = Number(fare.platformFareAmount != null ? fare.platformFareAmount
    : fare.collectedAmount != null ? fare.collectedAmount
      : fare.amount != null ? fare.amount
        : fare.totalFare);
  return {
    fareId: fare.fareId || fare.fareSegmentId || null,
    fareSegmentId: fare.fareSegmentId || fare.routeId || offer.routeId || null,
    fareAmount: Number.isFinite(amount) ? amount : null,
    currency: fare.currency || 'THB',
    pricingMode: fare.pricingMode || null,
    paymentOwnership: fare.paymentOwnership || 'sl_transit',
    externalPaymentRequired: fare.paymentOwnership === 'external_pay' || fare.saleStatus === 'external_payment_required',
    saleStatus: fare.saleStatus || null,
    serviceGroupId: fare.serviceGroupId || offer.serviceGroupId || null,
    sourceScope: directFare ? 'erpDataCenter.fares' : 'erpDataCenter.fareSegments',
    sourceLineage: fare.sourceLineage || []
  };
}

function applyFareContract(target, fareContract) {
  if (!target || !fareContract) return;
  target.fareId = fareContract.fareId;
  target.fareSegmentId = fareContract.fareSegmentId;
  target.fareAmount = fareContract.fareAmount;
  target.currency = fareContract.currency;
  target.pricingMode = fareContract.pricingMode;
  target.paymentOwnership = fareContract.paymentOwnership;
  target.externalPaymentRequired = fareContract.externalPaymentRequired === true;
  target.saleStatus = fareContract.saleStatus;
  target.fareSourceScope = fareContract.sourceScope;
}

function applyExternalPaymentPolicy(target) {
  if (!target) return;
  target.referenceOnly = true;
  target.externalReference = true;
  target.externalPaymentRequired = true;
  target.passengerDisplayMode = 'external_reference';
  target.disclaimerKey = EXTERNAL_SERVICE_DISCLAIMER_KEY;
  target.disclaimerTh = EXTERNAL_SERVICE_DISCLAIMER_TH;
  target.externalConfirmationRequired = true;
  target.slTransitFareCollection = false;
}

function timeEntryFromOffer(offer, fareContract) {
  const isExternal = offer.mappingStatus === 'external_schedule';
  const isEstimated = offer.isEstimated === true || offer.referenceOnly === true;
  const entry = {
    time: offer.departureTime,
    disabled: false,
    scheduleOfferId: offer.legacyPublishedTripId,
    routeId: offer.routeId,
    serviceGroupId: offer.serviceGroupId,
    mappingStatus: offer.mappingStatus,
    timeStatus: offer.timeStatus,
    timeType: offer.timeType,
    isEstimated,
    externalReference: isExternal,
    referenceOnly: isEstimated || isExternal ? true : offer.referenceOnly === true,
    primaryTimetableAuthority: offer.primaryTimetableAuthority === true,
    passengerDisplayMode: isExternal ? 'external_reference' : (isEstimated ? 'reference' : 'scheduled'),
    sourceLineage: offer.sourceLineage || []
  };
  applyFareContract(entry, fareContract);
  if (isExternal) {
    entry.disclaimerKey = EXTERNAL_SERVICE_DISCLAIMER_KEY;
    entry.disclaimerTh = EXTERNAL_SERVICE_DISCLAIMER_TH;
    entry.externalConfirmationRequired = true;
    entry.slTransitOperationalGuarantee = false;
    entry.slTransitFareCollection = false;
  }
  if (isEstimated) {
    entry.displayBadgeTh = ESTIMATED_BADGE_TH;
    entry.disclaimerKey = offer.disclaimerKey || ESTIMATED_DISCLAIMER_KEY;
    entry.disclaimerTh = offer.disclaimerTh || ESTIMATED_DISCLAIMER_TH;
  }
  if (fareContract && fareContract.externalPaymentRequired === true) {
    applyExternalPaymentPolicy(entry);
  }
  return entry;
}

function addTimeToPair(pair, offer, originLabel, destinationLabel, erp) {
  const fareContract = resolveFareContract(erp, offer);
  applyFareContract(pair, fareContract);
  if (!pair.segments.length) {
    pair.segments.push({
      label: 'ตารางเวลา',
      fromLabel: originLabel,
      toLabel: destinationLabel,
      times: []
    });
  }
  applyFareContract(pair.segments[0], fareContract);
  if (fareContract && fareContract.externalPaymentRequired === true) {
    pair.referenceOnly = true;
    pair.previewDisplayMode = 'external_reference';
    pair.routeChoiceStatus = 'external_reference';
    pair.externalReference = true;
    pair.externalPaymentRequired = true;
    pair.externalDisclaimerKey = EXTERNAL_SERVICE_DISCLAIMER_KEY;
    pair.externalDisclaimerTh = EXTERNAL_SERVICE_DISCLAIMER_TH;
    pair.slTransitFareCollection = false;
    pair.bookingEligible = false;
    applyExternalPaymentPolicy(pair.segments[0]);
  }
  pair.segments[0].times.push(timeEntryFromOffer(offer, fareContract));
}

function buildTransferReferencePair(rule, originLabel, destinationLabel, viaLabel) {
  const pairKey = compatibilityPairKey(originLabel, destinationLabel);
  const canonicalPairKey = transferCanonicalPairKey(rule);
  return {
    pairId: canonicalPairKey,
    canonicalPairKey,
    compatibilityPairKey: pairKey,
    keyType: 'compatibility_label_pair',
    compatibilityOnly: true,
    originLabel,
    destinationLabel,
    originDestinationId: rule.originStopKey,
    destinationId: rule.destStopKey,
    originNodeId: null,
    destinationNodeId: null,
    serviceGroupId: 'group_001',
    previewPriority: 'phase1_owner_review',
    publicationStatus: 'preview',
    productionReady: false,
    referenceOnly: true,
    previewDisplayMode: 'reference_needs_confirmation',
    routeChoiceStatus: 'unavailable_reference',
    unavailableReasonCode: 'transfer_feasibility_unknown',
    transfer: { required: true, viaStopKey: rule.viaStopKey },
    transferStatus: 'unknown',
    transferDisclaimerKey: TRANSFER_UNKNOWN_DISCLAIMER_KEY,
    transferDisclaimerTh: TRANSFER_UNKNOWN_DISCLAIMER_TH,
    transferRuleId: rule.transferRuleId,
    segments: [
      {
        label: 'ช่วงที่ 1',
        fromLabel: originLabel,
        toLabel: viaLabel,
        note: TRANSFER_UNKNOWN_DISCLAIMER_TH,
        referenceOnly: true,
        unavailable: true,
        availabilityStatus: 'needs_confirmation',
        routeChoiceStatus: 'unavailable_reference',
        times: []
      },
      {
        label: 'ช่วงที่ 2',
        fromLabel: viaLabel,
        toLabel: destinationLabel,
        note: TRANSFER_UNKNOWN_DISCLAIMER_TH,
        referenceOnly: true,
        unavailable: true,
        availabilityStatus: 'needs_confirmation',
        routeChoiceStatus: 'unavailable_reference',
        times: []
      }
    ],
    sourceLineage: rule.sourceLineage || []
  };
}

function findTransferLegEvidence(erp, routeId, fromStopKey, toStopKey) {
  return values(erp.scheduleOffers)
    .filter((offer) => (
      offer.routeId === routeId &&
      offer.originDestinationId === fromStopKey &&
      offer.destinationId === toStopKey &&
      offer.status !== 'inactive'
    ))
    .map((offer) => {
      const queueTrip = offer.queueTripId && erp.fleet && erp.fleet.queueTrips && erp.fleet.queueTrips[offer.queueTripId] || null;
      const queueStopTimes = queueTrip ? values(erp.stopTimes).filter((stopTime) => stopTime.queueTripId === queueTrip.queueTripId) : [];
      const originStopTime = queueStopTimes.find((stopTime) => stopTime.stopKey === fromStopKey) || null;
      const destinationStopTime = queueStopTimes.find((stopTime) => stopTime.stopKey === toStopKey) || null;
      return {
        offer,
        queueTrip,
        originStopTime,
        destinationStopTime,
        departureMinutes: timeToMinutes(offer.departureTime),
        arrivalMinutes: timeToMinutes(destinationStopTime && (destinationStopTime.arrivalTime || destinationStopTime.departureTime) || offer.departureTime)
      };
    });
}

function boardingPointForStopKey(erp, stopKey) {
  const destination = erp.destinations && erp.destinations[stopKey];
  if (!destination) return null;
  return values(erp.boardingPoints).find((boardingPoint) => boardingPoint.nodeId === destination.nodeId) || null;
}

function buildTransferAudit(rule, erp) {
  const routeIds = rule.segmentRouteIds || [];
  const leg1 = findTransferLegEvidence(erp, routeIds[0], rule.originStopKey, rule.viaStopKey);
  const leg2 = findTransferLegEvidence(erp, routeIds[1], rule.viaStopKey, rule.destStopKey);
  const boardingPoint = boardingPointForStopKey(erp, rule.viaStopKey);
  const policy = transferPolicyEvidence();
  const candidates = [];

  leg1.forEach((arrivalLeg) => {
    leg2.forEach((departureLeg) => {
      if (arrivalLeg.arrivalMinutes == null || departureLeg.departureMinutes == null) return;
      const waitMinutes = departureLeg.departureMinutes - arrivalLeg.arrivalMinutes;
      if (waitMinutes < 0) return;
      const feasible = waitMinutes >= TRANSFER_POLICY.minTransferMinutes && waitMinutes <= TRANSFER_POLICY.maxRecommendedWaitMinutes;
      candidates.push({
        feasible,
        waitMinutes,
        leg1DepartureTime: arrivalLeg.offer.departureTime,
        arrivalTimeAtTransfer: arrivalLeg.destinationStopTime && (arrivalLeg.destinationStopTime.arrivalTime || arrivalLeg.destinationStopTime.departureTime) || arrivalLeg.offer.departureTime,
        nextDepartureTime: departureLeg.offer.departureTime,
        transferStopKey: rule.viaStopKey,
        leg1ScheduleOfferId: arrivalLeg.offer.legacyPublishedTripId,
        leg2ScheduleOfferId: departureLeg.offer.legacyPublishedTripId,
        leg1RouteId: arrivalLeg.offer.routeId,
        leg2RouteId: departureLeg.offer.routeId,
        leg1MappingStatus: arrivalLeg.offer.mappingStatus,
        leg2MappingStatus: departureLeg.offer.mappingStatus,
        leg1TimeType: arrivalLeg.offer.timeType,
        leg2TimeType: departureLeg.offer.timeType,
        workbookEvidence: {
          policy,
          leg1OriginStop: queueTripWorkbookEvidence(erp, arrivalLeg.queueTrip, arrivalLeg.originStopTime),
          leg1TransferStop: queueTripWorkbookEvidence(erp, arrivalLeg.queueTrip, arrivalLeg.destinationStopTime),
          leg2TransferStop: queueTripWorkbookEvidence(erp, departureLeg.queueTrip, departureLeg.originStopTime)
        },
        sourceEvidence: {
          transferRule: lineagePaths([rule]),
          leg1ScheduleOffer: lineagePaths([arrivalLeg.offer]),
          leg2ScheduleOffer: lineagePaths([departureLeg.offer]),
          leg1StopTime: lineagePaths([arrivalLeg.originStopTime, arrivalLeg.destinationStopTime]),
          leg2StopTime: lineagePaths([departureLeg.originStopTime])
        }
      });
    });
  });

  const feasibleCandidates = candidates.filter((candidate) => candidate.feasible === true);
  const sortByPolicyFit = (a, b) => (
    Math.abs(a.waitMinutes - TRANSFER_POLICY.idealWaitMinutes) - Math.abs(b.waitMinutes - TRANSFER_POLICY.idealWaitMinutes) ||
    a.waitMinutes - b.waitMinutes ||
    a.nextDepartureTime.localeCompare(b.nextDepartureTime)
  );
  feasibleCandidates.sort(sortByPolicyFit);
  candidates.sort(sortByPolicyFit);

  const missing = [];
  if (!routeIds[0] || !routeIds[1]) missing.push('missing_transfer_route_segments');
  if (!leg1.length) missing.push('missing_arrival_leg_time');
  if (!leg2.length) missing.push('missing_next_leg_time');
  if (!boardingPoint) missing.push('missing_boarding_point');
  if (!candidates.length) missing.push('missing_transfer_buffer_candidate');

  return {
    status: feasibleCandidates.length ? 'feasible' : 'infeasible',
    policy,
    bestCandidate: feasibleCandidates[0] || candidates[0] || null,
    feasibleCandidates,
    candidateCount: candidates.length,
    feasibleCandidateCount: feasibleCandidates.length,
    missing,
    boardingPoint: boardingPoint ? {
      boardingPointId: boardingPoint.boardingPointId,
      nodeId: boardingPoint.nodeId,
      sourceLineage: boardingPoint.sourceLineage || []
    } : null,
    reason: feasibleCandidates.length ? null : 'wait_time_outside_policy_or_missing_transfer_timing'
  };
}

function connectionOptionFromCandidate(candidate) {
  return {
    time: candidate.leg1DepartureTime,
    departTime: candidate.leg1DepartureTime,
    label: `${candidate.leg1DepartureTime} น.`,
    referenceOnly: true,
    routeChoiceStatus: 'reference_only',
    passengerDisplayMode: 'transfer_reference',
    displayBadgeTh: TRANSFER_REFERENCE_BADGE_TH,
    disclaimerKey: TRANSFER_REFERENCE_DISCLAIMER_KEY,
    disclaimerTh: TRANSFER_REFERENCE_DISCLAIMER_TH,
    transferStopKey: candidate.transferStopKey,
    transferArrivalTime: candidate.arrivalTimeAtTransfer,
    nextDepartureTime: candidate.nextDepartureTime,
    waitMinutes: candidate.waitMinutes,
    leg1ScheduleOfferId: candidate.leg1ScheduleOfferId,
    leg2ScheduleOfferId: candidate.leg2ScheduleOfferId,
    sourceLineage: []
      .concat(candidate.sourceEvidence && candidate.sourceEvidence.transferRule || [])
      .concat(candidate.sourceEvidence && candidate.sourceEvidence.leg1ScheduleOffer || [])
      .concat(candidate.sourceEvidence && candidate.sourceEvidence.leg2ScheduleOffer || [])
  };
}

function connectionOptionsByOriginDeparture(audit) {
  const byDeparture = {};
  const candidates = Array.isArray(audit.feasibleCandidates) ? audit.feasibleCandidates : [];
  candidates.forEach((candidate) => {
    if (!candidate || !candidate.leg1DepartureTime) return;
    const existing = byDeparture[candidate.leg1DepartureTime];
    if (!existing) {
      byDeparture[candidate.leg1DepartureTime] = candidate;
      return;
    }
    const existingFit = Math.abs(existing.waitMinutes - TRANSFER_POLICY.idealWaitMinutes);
    const candidateFit = Math.abs(candidate.waitMinutes - TRANSFER_POLICY.idealWaitMinutes);
    if (
      candidateFit < existingFit ||
      (candidateFit === existingFit && candidate.waitMinutes < existing.waitMinutes) ||
      (candidateFit === existingFit && candidate.waitMinutes === existing.waitMinutes && candidate.nextDepartureTime.localeCompare(existing.nextDepartureTime) < 0)
    ) {
      byDeparture[candidate.leg1DepartureTime] = candidate;
    }
  });
  return Object.keys(byDeparture)
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
    .map((departureTime) => connectionOptionFromCandidate(byDeparture[departureTime]));
}

function applyFeasibleTransferPolicy(pair, audit) {
  pair.transferStatus = 'feasible_reference';
  pair.routeChoiceStatus = 'reference_only';
  pair.previewDisplayMode = 'transfer_reference';
  pair.referenceOnly = true;
  pair.bookingEligible = false;
  pair.guaranteedTransfer = false;
  pair.displayBadgeTh = TRANSFER_REFERENCE_BADGE_TH;
  pair.transferDisclaimerKey = TRANSFER_REFERENCE_DISCLAIMER_KEY;
  pair.transferDisclaimerTh = TRANSFER_REFERENCE_DISCLAIMER_TH;
  pair.transferTiming = {
    policy: audit.policy,
    bestConnection: audit.bestCandidate,
    connectionOptions: connectionOptionsByOriginDeparture(audit),
    candidateCount: audit.candidateCount,
    feasibleCandidateCount: audit.feasibleCandidateCount,
    boardingPoint: audit.boardingPoint
  };
  pair.connectionOptions = pair.transferTiming.connectionOptions;
  pair.segments.forEach((segment) => {
    segment.note = TRANSFER_REFERENCE_DISCLAIMER_TH;
    segment.unavailable = false;
    segment.availabilityStatus = 'reference_only';
    segment.routeChoiceStatus = 'reference_only';
  });
  return pair;
}

function applyInfeasibleTransferPolicy(pair, audit) {
  pair.transferStatus = 'infeasible';
  pair.routeChoiceStatus = 'unavailable_reference';
  pair.previewDisplayMode = 'reference_unavailable';
  pair.referenceOnly = true;
  pair.bookingEligible = false;
  pair.guaranteedTransfer = false;
  pair.unavailableReasonCode = 'transfer_wait_time_outside_policy';
  pair.infeasibleReason = 'wait time outside policy';
  pair.displayBadgeTh = TRANSFER_REFERENCE_BADGE_TH;
  pair.transferDisclaimerKey = TRANSFER_REFERENCE_DISCLAIMER_KEY;
  pair.transferDisclaimerTh = TRANSFER_REFERENCE_DISCLAIMER_TH;
  pair.transferTiming = {
    policy: audit.policy,
    bestConnection: audit.bestCandidate,
    candidateCount: audit.candidateCount,
    feasibleCandidateCount: audit.feasibleCandidateCount,
    missing: audit.missing,
    reason: audit.reason,
    boardingPoint: audit.boardingPoint
  };
  pair.segments.forEach((segment) => {
    segment.note = TRANSFER_REFERENCE_DISCLAIMER_TH;
    segment.referenceOnly = true;
    segment.unavailable = true;
    segment.availabilityStatus = 'infeasible';
    segment.routeChoiceStatus = 'unavailable_reference';
  });
  return pair;
}

function summarizeMappingStatus(scheduleOffers) {
  return values(scheduleOffers).reduce((summary, offer) => {
    summary[offer.mappingStatus] = (summary[offer.mappingStatus] || 0) + 1;
    return summary;
  }, {});
}

function summarizeTimeTypes(pairs) {
  const summary = {};
  values(pairs).forEach((pair) => {
    (pair.segments || []).forEach((segment) => {
      (segment.times || []).forEach((time) => {
        const key = time.timeType || 'unknown';
        summary[key] = (summary[key] || 0) + 1;
      });
    });
  });
  return summary;
}

function hasForbiddenOperationalClaim(value) {
  if (!value || typeof value !== 'object') return null;
  for (const field of FORBIDDEN_OPERATIONAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field) && value[field] != null && value[field] !== false) return field;
  }
  for (const key of Object.keys(value)) {
    const nested = hasForbiddenOperationalClaim(value[key]);
    if (nested) return nested;
  }
  return null;
}

function validatePublishedSchedule(publishedSchedule) {
  const blockers = [];
  const warnings = [];
  function block(code, path, detail) {
    blockers.push({ level: 'blocker', code, path, detail: detail == null ? null : detail });
  }
  function warn(code, path, detail) {
    warnings.push({ level: 'warning', code, path, detail: detail == null ? null : detail });
  }

  if (!publishedSchedule || typeof publishedSchedule !== 'object') block('published-schedule-missing', 'publishedSchedule');
  if (publishedSchedule.publicationStatus !== 'preview') block('publication-status-not-preview', 'publishedSchedule/publicationStatus');
  if (publishedSchedule.productionReady !== false) block('production-ready-not-false', 'publishedSchedule/productionReady');
  if (publishedSchedule.readyForApply !== false) block('ready-for-apply-not-false', 'publishedSchedule/readyForApply');

  const interpretation = publishedSchedule.ownerWorkbookInterpretation || {};
  const stopSequence = interpretation.stopSequence || {};
  const routeIdentity = interpretation.routeIdentity || {};
  const bookingAvailability = interpretation.bookingAvailability || {};
  const transferPolicy = interpretation.transferPolicy || {};
  const queueCodeInterpretation = interpretation.queueCodeInterpretation || {};
  const vehicleDriverLogin = interpretation.vehicleDriverLogin || {};
  if (interpretation.sourceWorkbook !== OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook) {
    block('owner-workbook-source-missing', 'publishedSchedule/ownerWorkbookInterpretation/sourceWorkbook');
  }
  if (stopSequence.stopCountPolicy !== 'route_sequence_version_dynamic' || stopSequence.requireNewRouteSequenceVersionOnStopChange !== true || stopSequence.neverRewriteHistoricalRouteSequences !== true) {
    block('stop-count-hard-coded-policy', 'publishedSchedule/ownerWorkbookInterpretation/stopSequence');
  }
  if (publishedSchedule.counts && stopSequence.currentActiveStopCount !== publishedSchedule.counts.origins) {
    block('stop-count-interpretation-mismatch', 'publishedSchedule/ownerWorkbookInterpretation/stopSequence/currentActiveStopCount');
  }
  if (publishedSchedule.counts && stopSequence.currentExpectedDestinationsPerOrigin !== Math.max(0, publishedSchedule.counts.origins - 1)) {
    block('per-origin-destination-formula-mismatch', 'publishedSchedule/ownerWorkbookInterpretation/stopSequence/currentExpectedDestinationsPerOrigin');
  }
  if (routeIdentity.routeIdIsUniqueOdId !== false || routeIdentity.duplicateOriginBucketsAllowedOnlyWhenDestinationKeyDiffers !== true) {
    block('origin-bucket-duplicate-policy-missing', 'publishedSchedule/ownerWorkbookInterpretation/routeIdentity');
  }
  const odIdentityFields = routeIdentity.uniqueOdIdentityFields || [];
  if (odIdentityFields.indexOf('originStopKey') === -1 || odIdentityFields.indexOf('destinationKey') === -1) {
    block('od-identity-must-include-origin-destination', 'publishedSchedule/ownerWorkbookInterpretation/routeIdentity/uniqueOdIdentityFields');
  }
  if (bookingAvailability.defaultWhenBlank !== 'open' || bookingAvailability.blankMeansClosed !== false || bookingAvailability.explicitRestrictionsOnly !== true) {
    block('booking-blank-default-policy-missing', 'publishedSchedule/ownerWorkbookInterpretation/bookingAvailability');
  }
  if (!bookingAvailability.specialOverrides || !bookingAvailability.specialOverrides.wangNamYen || bookingAvailability.specialOverrides.wangNamYen.bookingEligible !== false || bookingAvailability.specialOverrides.wangNamYen.overrideWorkbookOpen !== true) {
    block('wang-nam-yen-booking-override-missing', 'publishedSchedule/ownerWorkbookInterpretation/bookingAvailability/specialOverrides/wangNamYen');
  }
  if (transferPolicy.globalTransferHub != null || transferPolicy.globalTransferHubAllowed !== false || transferPolicy.transferNodeScope !== 'per_journey_candidate' || transferPolicy.explicitTransferNodeRequired !== true) {
    block('global-transfer-hub-forbidden', 'publishedSchedule/ownerWorkbookInterpretation/transferPolicy');
  }
  if (!queueCodeInterpretation.numericQueueCodeMap || queueCodeInterpretation.numericQueueCodeMap['5'] !== 'Q_005') {
    block('numeric-queue-code-map-missing', 'publishedSchedule/ownerWorkbookInterpretation/queueCodeInterpretation/numericQueueCodeMap');
  }
  if (queueCodeInterpretation.q005Sheet05Evidence === false) {
    const q005Fallback = queueCodeInterpretation.q005FallbackPolicy || {};
    if (q005Fallback.source !== 'owner_approved_policy' || q005Fallback.directSheet05Evidence !== false || !Array.isArray(q005Fallback.trips) || q005Fallback.trips.length !== 2) {
      block('q005-owner-policy-lineage-missing', 'publishedSchedule/ownerWorkbookInterpretation/queueCodeInterpretation/q005FallbackPolicy');
    }
  }
  if (vehicleDriverLogin.previewOnly !== true || vehicleDriverLogin.productionCredentialUseAllowed !== false || vehicleDriverLogin.createProductionCredentials !== false || vehicleDriverLogin.createBankOrSettlementRecords !== false) {
    block('preview-credentials-production-forbidden', 'publishedSchedule/ownerWorkbookInterpretation/vehicleDriverLogin');
  }

  const pairs = publishedSchedule.pairs || {};
  const compatibilityKeyIndex = publishedSchedule.compatibilityKeyIndex || {};
  const excludedTransferPairs = publishedSchedule.excludedPreviewPairs && publishedSchedule.excludedPreviewPairs.transferUnknown || {};
  const excludedInfeasibleTransferPairs = publishedSchedule.excludedPreviewPairs && publishedSchedule.excludedPreviewPairs.transferInfeasible || {};
  const originOptions = Array.isArray(publishedSchedule.originOptions) ? publishedSchedule.originOptions : [];
  const destinationOptionsByOrigin = publishedSchedule.destinationOptionsByOrigin || {};
  const mapView = publishedSchedule.mapView || {};
  const mapStops = Array.isArray(mapView.stops) ? mapView.stops : [];
  const mapRoutes = Array.isArray(mapView.routes) ? mapView.routes : [];
  const scheduleOfferIds = [];
  const canonicalKeys = new Set();
  if (!originOptions.length) {
    block('origin-options-missing', 'publishedSchedule/originOptions');
  }
  if (mapView.schemaVersion !== 'publishedSchedule.mapView.v1.preview' || mapView.referenceOnly !== true || mapView.operationalProof !== false) {
    block('map-view-policy-invalid', 'publishedSchedule/mapView');
  }
  if (mapStops.length !== (publishedSchedule.counts && publishedSchedule.counts.origins)) {
    block('map-view-stop-count-mismatch', 'publishedSchedule/mapView/stops', { expected: publishedSchedule.counts && publishedSchedule.counts.origins, actual: mapStops.length });
  }
  mapStops.forEach((stop, index) => {
    const expectedWorkbookStop = stop && OWNER_WORKBOOK_STOPS[stop.stopKey];
    const expectedIconSource = stop && OWNER_WORKBOOK_STOP_ICONS[stop.stopKey];
    if (!stop || !stop.stopKey || !stop.nodeId || !stop.groupStopId || !stop.groupStopCode || !stop.label || stop.displayOrder !== index) {
      block('map-view-stop-identity-invalid', `publishedSchedule/mapView/stops/${index}`);
    }
    if (!Number.isFinite(Number(stop.lat)) || !Number.isFinite(Number(stop.lng)) || !stop.icon) {
      block('map-view-stop-coordinate-invalid', `publishedSchedule/mapView/stops/${index}`);
    }
    if (!expectedWorkbookStop) {
      block('map-view-stop-workbook-source-missing', `publishedSchedule/mapView/stops/${index}`, { stopKey: stop && stop.stopKey });
    } else if (Math.abs(Number(stop.lat) - expectedWorkbookStop.lat) > 0.000001 || Math.abs(Number(stop.lng) - expectedWorkbookStop.lng) > 0.000001) {
      block('map-view-stop-coordinate-mismatch', `publishedSchedule/mapView/stops/${index}`, {
        expected: { lat: expectedWorkbookStop.lat, lng: expectedWorkbookStop.lng },
        actual: { lat: stop.lat, lng: stop.lng }
      });
    }
    if (!expectedIconSource || stop.icon !== expectedIconSource.icon) {
      block('map-view-stop-icon-mismatch', `publishedSchedule/mapView/stops/${index}/icon`, { expected: expectedIconSource && expectedIconSource.icon, actual: stop.icon });
    }
    if (stop.referenceOnly !== true || stop.previewDisplayMode !== 'static_map_reference' || !Array.isArray(stop.sourceLineage) || !stop.sourceLineage.length) {
      block('map-view-stop-lineage-invalid', `publishedSchedule/mapView/stops/${index}`);
    }
    if (!Array.isArray(stop.sourceLineage) || !stop.sourceLineage.some((lineage) => lineage.sourceSystem === 'owner_workbook' && /!F\d+$/.test(lineage.sourcePath || ''))) {
      block('map-view-stop-icon-lineage-missing', `publishedSchedule/mapView/stops/${index}/sourceLineage`);
    }
    if (!Array.isArray(stop.sourceLineage) || !stop.sourceLineage.some((lineage) => lineage.sourceSystem === 'owner_workbook' && /!D\d+:E\d+$/.test(lineage.sourcePath || ''))) {
      block('map-view-stop-coordinate-lineage-missing', `publishedSchedule/mapView/stops/${index}/sourceLineage`);
    }
  });
  const visibleMapStopKeys = new Set(mapStops.map((stop) => stop && stop.stopKey).filter(Boolean));
  Object.keys(OWNER_WORKBOOK_STOPS).forEach((stopKey) => {
    if (!visibleMapStopKeys.has(stopKey)) {
      block('map-view-workbook-stop-missing', 'publishedSchedule/mapView/stops', { stopKey });
    }
  });
  const primaryMapRoute = mapRoutes[0] || {};
  const routeGeometryType = primaryMapRoute.geometryType;
  const routePolyline = Array.isArray(primaryMapRoute.polyline) ? primaryMapRoute.polyline : [];
  if (!mapRoutes.length || !Array.isArray(primaryMapRoute.stopKeys) || primaryMapRoute.stopKeys.length !== mapStops.length || !Array.isArray(primaryMapRoute.sourceLineage) || !primaryMapRoute.sourceLineage.length || primaryMapRoute.referenceOnly !== true || primaryMapRoute.operationalProof !== false) {
    block('map-view-route-invalid', 'publishedSchedule/mapView/routes/0');
  }
  if (routeGeometryType !== 'road_polyline' && routeGeometryType !== 'stop_to_stop_fallback') {
    block('map-view-route-geometry-type-invalid', 'publishedSchedule/mapView/routes/0/geometryType', routeGeometryType);
  }
  if (!routePolyline.length || routePolyline.some((point) => !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng)))) {
    block('map-view-route-invalid', 'publishedSchedule/mapView/routes/0');
  }
  if (routeGeometryType === 'road_polyline' && routePolyline.length <= mapStops.length) {
    block('map-view-road-polyline-too-short', 'publishedSchedule/mapView/routes/0/polyline', { expectedMoreThan: mapStops.length, actual: routePolyline.length });
  }
  if (routeGeometryType === 'stop_to_stop_fallback' && routePolyline.length !== mapStops.length) {
    block('map-view-fallback-polyline-invalid', 'publishedSchedule/mapView/routes/0/polyline', { expected: mapStops.length, actual: routePolyline.length });
  }
  originOptions.forEach((origin, index) => {
    if (!origin || !origin.originLabel || !origin.originDestinationId || origin.displayOrder !== index) {
      block('origin-option-invalid', `publishedSchedule/originOptions/${index}`);
    }
    if (!Array.isArray(destinationOptionsByOrigin[origin.originLabel])) {
      block('destination-options-by-origin-missing', `publishedSchedule/destinationOptionsByOrigin/${origin.originLabel}`);
    }
  });
  Object.keys(destinationOptionsByOrigin).forEach((originLabel) => {
    const options = destinationOptionsByOrigin[originLabel];
    if (!Array.isArray(options)) {
      block('destination-options-by-origin-not-array', `publishedSchedule/destinationOptionsByOrigin/${originLabel}`);
      return;
    }
    options.forEach((option, index) => {
      if (!option || !option.label || !option.destinationId || !option.pairKey) {
        block('destination-option-invalid', `publishedSchedule/destinationOptionsByOrigin/${originLabel}/${index}`);
        return;
      }
      if (option.label === originLabel) {
        block('destination-option-selected-origin-visible', `publishedSchedule/destinationOptionsByOrigin/${originLabel}/${index}`);
      }
      if (option.displayOrder !== index) {
        block('destination-option-display-order-invalid', `publishedSchedule/destinationOptionsByOrigin/${originLabel}/${index}`);
      }
      if (!pairs[option.pairKey]) {
        block('destination-option-pair-key-missing', `publishedSchedule/destinationOptionsByOrigin/${originLabel}/${index}/pairKey`, option.pairKey);
      }
    });
  });
  Object.keys(pairs).forEach((pairKey) => {
    const pair = pairs[pairKey];
    if (pair.keyType !== 'compatibility_label_pair' || pair.compatibilityOnly !== true) {
      block('compatibility-pair-key-not-marked', `publishedSchedule/pairs/${pairKey}`);
    }
    if (pair.compatibilityPairKey !== pairKey) {
      block('compatibility-pair-key-mismatch', `publishedSchedule/pairs/${pairKey}`, pair.compatibilityPairKey);
    }
    if (!pair.canonicalPairKey || pair.pairId !== pair.canonicalPairKey) {
      block('canonical-pair-id-missing', `publishedSchedule/pairs/${pairKey}`);
    }
    if (!pair.originDestinationId || !pair.destinationId) {
      block('od-identity-missing-on-pair', `publishedSchedule/pairs/${pairKey}`);
    }
    if (pair.canonicalPairKey === pairKey || pair.pairId === pairKey || !String(pair.canonicalPairKey || '').startsWith('psv1_pair_')) {
      block('label-derived-canonical-pair-id', `publishedSchedule/pairs/${pairKey}`, pair.canonicalPairKey || pair.pairId);
    }
    if (canonicalKeys.has(pair.canonicalPairKey)) {
      block('canonical-pair-key-duplicate', `publishedSchedule/pairs/${pairKey}`, pair.canonicalPairKey);
    }
    canonicalKeys.add(pair.canonicalPairKey);
    if (!compatibilityKeyIndex[pairKey] || compatibilityKeyIndex[pairKey].canonicalPairKey !== pair.canonicalPairKey) {
      block('compatibility-key-index-missing', `publishedSchedule/compatibilityKeyIndex/${pairKey}`);
    }
    if (pair.transferStatus === 'unknown') {
      block('unknown-transfer-visible-in-preview', `publishedSchedule/pairs/${pairKey}`);
    }
    if ((pair.originDestinationId === 'wangnamyen' || pair.destinationId === 'wangnamyen') && pair.bookingEligible === true) {
      block('wang-nam-yen-booking-override-not-enforced', `publishedSchedule/pairs/${pairKey}`);
    }
    if (pair.transferStatus === 'feasible_reference') {
      if (pair.referenceOnly !== true || pair.routeChoiceStatus !== 'reference_only' || pair.previewDisplayMode !== 'transfer_reference') {
        block('feasible-transfer-not-reference-only', `publishedSchedule/pairs/${pairKey}`);
      }
      if (pair.bookingEligible !== false || pair.guaranteedTransfer !== false) {
        block('feasible-transfer-operational-claim', `publishedSchedule/pairs/${pairKey}`);
      }
      if (pair.displayBadgeTh !== TRANSFER_REFERENCE_BADGE_TH || pair.transferDisclaimerKey !== TRANSFER_REFERENCE_DISCLAIMER_KEY || pair.transferDisclaimerTh !== TRANSFER_REFERENCE_DISCLAIMER_TH) {
        block('feasible-transfer-display-policy-missing', `publishedSchedule/pairs/${pairKey}`);
      }
      if (!pair.transferTiming || !pair.transferTiming.bestConnection || pair.transferTiming.bestConnection.waitMinutes < TRANSFER_POLICY.minTransferMinutes || pair.transferTiming.bestConnection.waitMinutes > TRANSFER_POLICY.maxRecommendedWaitMinutes) {
        block('feasible-transfer-policy-evidence-missing', `publishedSchedule/pairs/${pairKey}/transferTiming`);
      }
    }
    (pair.segments || []).forEach((segment, segmentIndex) => {
      (segment.times || []).forEach((time, timeIndex) => {
        scheduleOfferIds.push(time.scheduleOfferId);
        if (time.mappingStatus === 'external_schedule') {
          if (time.referenceOnly !== true || time.externalReference !== true || time.passengerDisplayMode !== 'external_reference') {
            block('external-schedule-not-reference', `publishedSchedule/pairs/${pairKey}/segments/${segmentIndex}/times/${timeIndex}`);
          }
          if (time.disclaimerKey !== EXTERNAL_SERVICE_DISCLAIMER_KEY || !time.disclaimerTh || time.slTransitFareCollection !== false) {
            block('external-schedule-disclaimer-missing', `publishedSchedule/pairs/${pairKey}/segments/${segmentIndex}/times/${timeIndex}`);
          }
        }
        if (time.isEstimated === true || time.referenceOnly === true) {
          if (time.referenceOnly !== true) block('reference-time-reference-only-required', `publishedSchedule/pairs/${pairKey}/segments/${segmentIndex}/times/${timeIndex}`);
        }
        if (time.isEstimated === true) {
          if (time.displayBadgeTh !== ESTIMATED_BADGE_TH) block('estimated-time-badge-missing', `publishedSchedule/pairs/${pairKey}/segments/${segmentIndex}/times/${timeIndex}`);
          if (time.disclaimerKey !== ESTIMATED_DISCLAIMER_KEY || !time.disclaimerTh) block('estimated-time-disclaimer-missing', `publishedSchedule/pairs/${pairKey}/segments/${segmentIndex}/times/${timeIndex}`);
        }
      });
    });
  });

  Object.keys(excludedTransferPairs).forEach((pairKey) => {
    const pair = excludedTransferPairs[pairKey];
    if (pair.transferStatus !== 'unknown' || pair.referenceOnly !== true || pair.routeChoiceStatus !== 'unavailable_reference') {
      block('excluded-transfer-not-reference-unavailable', `publishedSchedule/excludedPreviewPairs/transferUnknown/${pairKey}`);
    }
    if (!pair.transferDisclaimerTh) {
      block('excluded-transfer-missing-disclaimer', `publishedSchedule/excludedPreviewPairs/transferUnknown/${pairKey}`);
    }
    (pair.segments || []).forEach((segment, segmentIndex) => {
      if ((segment.times || []).length !== 0 || segment.referenceOnly !== true || segment.unavailable !== true || segment.availabilityStatus !== 'needs_confirmation') {
        block('excluded-transfer-segment-not-marked-unavailable', `publishedSchedule/excludedPreviewPairs/transferUnknown/${pairKey}/segments/${segmentIndex}`);
      }
    });
  });

  Object.keys(excludedInfeasibleTransferPairs).forEach((pairKey) => {
    const pair = excludedInfeasibleTransferPairs[pairKey];
    if (pair.transferStatus !== 'infeasible' || pair.referenceOnly !== true || pair.routeChoiceStatus !== 'unavailable_reference') {
      block('excluded-infeasible-transfer-not-unavailable', `publishedSchedule/excludedPreviewPairs/transferInfeasible/${pairKey}`);
    }
    if (pair.bookingEligible !== false || pair.guaranteedTransfer !== false) {
      block('excluded-infeasible-transfer-operational-claim', `publishedSchedule/excludedPreviewPairs/transferInfeasible/${pairKey}`);
    }
    if (!String(pair.infeasibleReason || '').includes('wait time outside policy')) {
      block('excluded-infeasible-transfer-reason-missing', `publishedSchedule/excludedPreviewPairs/transferInfeasible/${pairKey}`);
    }
    if (!pair.transferTiming || !pair.transferTiming.policy || !pair.transferTiming.bestConnection) {
      block('excluded-infeasible-transfer-evidence-missing', `publishedSchedule/excludedPreviewPairs/transferInfeasible/${pairKey}/transferTiming`);
    }
    (pair.segments || []).forEach((segment, segmentIndex) => {
      if ((segment.times || []).length !== 0 || segment.referenceOnly !== true || segment.unavailable !== true || segment.availabilityStatus !== 'infeasible') {
        block('excluded-infeasible-transfer-segment-not-hidden', `publishedSchedule/excludedPreviewPairs/transferInfeasible/${pairKey}/segments/${segmentIndex}`);
      }
    });
  });

  const uniqueOfferCount = new Set(scheduleOfferIds).size;
  if (scheduleOfferIds.length !== publishedSchedule.counts.scheduleOfferTimes) {
    block('schedule-offer-time-count-mismatch', 'publishedSchedule/counts/scheduleOfferTimes', {
      expected: publishedSchedule.counts.scheduleOfferTimes,
      actual: scheduleOfferIds.length
    });
  }
  if (uniqueOfferCount !== scheduleOfferIds.length) {
    block('schedule-offer-duplicate-render-row', 'publishedSchedule/pairs', {
      unique: uniqueOfferCount,
      rows: scheduleOfferIds.length
    });
  }

  const forbiddenField = hasForbiddenOperationalClaim(publishedSchedule);
  if (forbiddenField) block('operational-claim-forbidden', 'publishedSchedule', forbiddenField);
  if (publishedSchedule.compatibilityTarget !== 'passenger_publishedSchedule_v1') warn('compatibility-target-unexpected', 'publishedSchedule/compatibilityTarget');

  return {
    readyForReview: blockers.length === 0,
    readyForApply: false,
    blockers,
    warnings
  };
}

async function buildPublishedScheduleV1DryRun() {
  const erpResult = await buildDryRunSnapshot();
  const erp = erpResult.snapshot.erpDataCenter;
  const destinationsById = erp.destinations;
  const networkNodesById = erp.networkNodes;
  const routesById = erp.routes;
  const originSort = buildOriginSort(erp);
  const originDestinations = values(destinationsById)
    .filter((destination) => destination.originSelectable === true && destination.status !== 'inactive')
    .sort(originSort);
  const destinationList = values(destinationsById)
    .filter((destination) => destination.destinationSelectable === true && destination.status !== 'inactive')
    .sort((a, b) => a.displayNameTh.localeCompare(b.displayNameTh, 'th'));

  const origins = originDestinations.map((destination) => destination.displayNameTh);
  const destinations = destinationList.reduce((map, destination) => {
    map[destination.displayNameTh] = {
      destinationId: destination.destinationId,
      nodeId: destination.nodeId,
      group: displayGroupForDestination(destination, erp.serviceGroups),
      originSelectable: destination.originSelectable === true,
      destinationSelectable: destination.destinationSelectable === true,
      phaseStatus: destination.phaseStatus,
      referenceOnly: destination.originSelectable !== true,
      sourceLineage: destination.sourceLineage || []
    };
    return map;
  }, {});
  const originOptions = buildOriginOptions(originDestinations);
  const destinationOrderById = buildDestinationOrder(erp, destinationList);

  const pairs = {};
  const excludedTransferPairs = {};
  const excludedInfeasibleTransferPairs = {};
  values(erp.scheduleOffers).forEach((offer) => {
    const route = routesById[offer.routeId];
    if (!route || offer.status === 'inactive') return;
    const originDestination = destinationsById[offer.originDestinationId];
    const destination = destinationsById[offer.destinationId];
    const originNode = networkNodesById[offer.originNodeId];
    const destinationNode = networkNodesById[offer.destinationNodeId];
    const originLabel = originDestination && originDestination.displayNameTh || originNode && originNode.displayNameTh;
    const destinationLabel = destination && destination.displayNameTh || destinationNode && destinationNode.displayNameTh;
    if (!originLabel || !destinationLabel) return;

    const pairKey = compatibilityPairKey(originLabel, destinationLabel);
    if (!pairs[pairKey]) {
      const canonicalPairKey = scheduledCanonicalPairKey(offer);
      pairs[pairKey] = {
        pairId: canonicalPairKey,
        canonicalPairKey,
        compatibilityPairKey: pairKey,
        keyType: 'compatibility_label_pair',
        compatibilityOnly: true,
        originLabel,
        destinationLabel,
        originDestinationId: offer.originDestinationId,
        destinationId: offer.destinationId,
        originNodeId: offer.originNodeId,
        destinationNodeId: offer.destinationNodeId,
        serviceGroupId: offer.serviceGroupId,
        previewPriority: offer.serviceGroupId === 'group_001' ? 'phase1_owner_review' : 'compatibility_reference',
        publicationStatus: 'preview',
        productionReady: false,
        referenceOnly: offer.mappingStatus === 'external_schedule' ? true : false,
        previewDisplayMode: offer.mappingStatus === 'external_schedule' ? 'external_reference' : 'schedule_preview',
        routeChoiceStatus: offer.mappingStatus === 'external_schedule' ? 'external_reference' : 'preview_available',
        externalReference: offer.mappingStatus === 'external_schedule',
        externalDisclaimerKey: offer.mappingStatus === 'external_schedule' ? EXTERNAL_SERVICE_DISCLAIMER_KEY : null,
        externalDisclaimerTh: offer.mappingStatus === 'external_schedule' ? EXTERNAL_SERVICE_DISCLAIMER_TH : null,
        transfer: null,
        transferStatus: 'not_required',
        transferDisclaimerKey: null,
        transferDisclaimerTh: null,
        transferRuleId: null,
        segments: [],
        sourceLineage: []
      };
    }
    pairs[pairKey].sourceLineage = pairs[pairKey].sourceLineage.concat(offer.sourceLineage || []);
    addTimeToPair(pairs[pairKey], offer, originLabel, destinationLabel, erp);
  });

  values(erp.transferRules).forEach((rule) => {
    const originDestination = destinationsById[rule.originStopKey];
    const destination = destinationsById[rule.destStopKey];
    const viaDestination = destinationsById[rule.viaStopKey];
    if (!originDestination || !destination || !viaDestination) return;
    const originLabel = originDestination.displayNameTh;
    const destinationLabel = destination.displayNameTh;
    const pairKey = compatibilityPairKey(originLabel, destinationLabel);
    const transferPair = buildTransferReferencePair(rule, originLabel, destinationLabel, viaDestination.displayNameTh);
    const audit = buildTransferAudit(rule, erp);
    if (audit.status === 'feasible') {
      pairs[pairKey] = applyFeasibleTransferPolicy(transferPair, audit);
    } else {
      excludedInfeasibleTransferPairs[pairKey] = applyInfeasibleTransferPolicy(transferPair, audit);
    }
  });

  addMissingGroupOneDestinationPairs(originOptions, pairs);

  Object.keys(pairs).forEach((pairKey) => {
    pairs[pairKey].segments.forEach((segment) => {
      segment.times.sort((a, b) => a.time.localeCompare(b.time));
    });
  });

  const mappingStatusSummary = summarizeMappingStatus(erp.scheduleOffers);
  const timeTypeSummary = summarizeTimeTypes(pairs);
  const transferUnknownPairs = Object.keys(excludedTransferPairs).length;
  const transferFeasibleReferencePairs = values(pairs).filter((pair) => pair.transferStatus === 'feasible_reference').length;
  const transferInfeasibleAuditPairs = Object.keys(excludedInfeasibleTransferPairs).length;
  const compatibilityKeyIndex = Object.keys(pairs).sort().reduce((map, pairKey) => {
    const pair = pairs[pairKey];
    map[pairKey] = {
      keyType: 'compatibility_label_pair',
      compatibilityOnly: true,
      canonicalPairKey: pair.canonicalPairKey,
      originLabel: pair.originLabel,
      destinationLabel: pair.destinationLabel
    };
    return map;
  }, {});
  const estimatedReferenceTimes = values(pairs).reduce((total, pair) => total + (pair.segments || []).reduce((segTotal, segment) => (
    segTotal + (segment.times || []).filter((time) => time.isEstimated === true && time.referenceOnly === true).length
  ), 0), 0);
  const destinationOptionsByOrigin = buildDestinationOptionsByOrigin(originOptions, pairs, destinationsById, destinations, destinationOrderById);
  const mapView = buildMapView(erp);

  const publishedSchedule = {
    schemaVersion: 'publishedSchedule.v1.preview',
    publicationStatus: 'preview',
    productionReady: false,
    readyForApply: false,
    compatibilityTarget: 'passenger_publishedSchedule_v1',
    source: {
      erpDataCenterSnapshot: 'Round 2 dry-run',
      erpReadyForReview: erpResult.validation.readyForReview,
      erpReadyForApply: erpResult.validation.readyForApply,
      ownerWorkbook: OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook,
      sourcePaths: [
        'data/erpDataCenter/destinations',
        'data/erpDataCenter/groupStops',
        'data/erpDataCenter/networkNodes',
        'data/erpDataCenter/scheduleOffers',
        'data/erpDataCenter/stops',
        'data/erpDataCenter/transferRules',
        'data/erpDataCenter/fares',
        'data/erpDataCenter/fareSegments'
      ]
    },
    displayPolicy: {
      passengerDisplayOnly: true,
      referenceOnlyMeans: 'display_as_reference',
      estimatedBadgeTh: ESTIMATED_BADGE_TH,
      estimatedDisclaimerKey: ESTIMATED_DISCLAIMER_KEY,
      estimatedDisclaimerTh: ESTIMATED_DISCLAIMER_TH,
      unknownTransferDisclaimerKey: TRANSFER_UNKNOWN_DISCLAIMER_KEY,
      unknownTransferDisclaimerTh: TRANSFER_UNKNOWN_DISCLAIMER_TH,
      transferReferenceBadgeTh: TRANSFER_REFERENCE_BADGE_TH,
      transferReferenceDisclaimerKey: TRANSFER_REFERENCE_DISCLAIMER_KEY,
      transferReferenceDisclaimerTh: TRANSFER_REFERENCE_DISCLAIMER_TH,
      transferReferencePolicy: transferPolicyEvidence(),
      externalServiceDisclaimerKey: EXTERNAL_SERVICE_DISCLAIMER_KEY,
      externalServiceDisclaimerTh: EXTERNAL_SERVICE_DISCLAIMER_TH
    },
    ownerWorkbookInterpretation: buildOwnerWorkbookInterpretation(origins.length),
    counts: {
      origins: origins.length,
      destinations: Object.keys(destinations).length,
      pairs: Object.keys(pairs).length,
      visiblePairs: Object.keys(pairs).length,
      scheduleOfferTimes: values(erp.scheduleOffers).length,
      transferUnknownPairs,
      transferReferencePairs: transferFeasibleReferencePairs,
      transferFeasibleReferencePairs,
      transferInfeasibleAuditPairs,
      excludedFromPreview: {
        transferUnknown: Object.keys(excludedTransferPairs).length,
        transferInfeasible: transferInfeasibleAuditPairs
      },
      estimatedReferenceTimes,
      mapViewStops: mapView.stops.length,
      mapViewRoutes: mapView.routes.length
    },
    mappingStatusSummary,
    timeTypeSummary,
    origins,
    originOptions,
    destinations,
    destinationOptionsByOrigin,
    mapView,
    compatibilityKeyIndex,
    excludedPreviewPairs: {
      transferUnknown: excludedTransferPairs,
      transferInfeasible: excludedInfeasibleTransferPairs
    },
    pairs
  };

  const validation = validatePublishedSchedule(publishedSchedule);
  return {
    dryRun: true,
    writesEnabled: false,
    readyForApply: false,
    targetPath: 'publishedSchedule',
    publishedSchedule,
    validation,
    sourceValidation: erpResult.validation
  };
}

if (require.main === module) {
  buildPublishedScheduleV1DryRun().then((result) => {
    console.log(JSON.stringify({
      dryRun: result.dryRun,
      writesEnabled: result.writesEnabled,
      readyForApply: result.readyForApply,
      targetPath: result.targetPath,
      counts: result.publishedSchedule.counts,
      mappingStatusSummary: result.publishedSchedule.mappingStatusSummary,
      timeTypeSummary: result.publishedSchedule.timeTypeSummary,
      validation: result.validation
    }, null, 2));
  }).catch((error) => {
    console.error(error && error.stack || error);
    process.exit(1);
  });
}

module.exports = {
  ESTIMATED_BADGE_TH,
  ESTIMATED_DISCLAIMER_KEY,
  ESTIMATED_DISCLAIMER_TH,
  TRANSFER_UNKNOWN_DISCLAIMER_KEY,
  TRANSFER_UNKNOWN_DISCLAIMER_TH,
  TRANSFER_REFERENCE_BADGE_TH,
  TRANSFER_REFERENCE_DISCLAIMER_KEY,
  TRANSFER_REFERENCE_DISCLAIMER_TH,
  TRANSFER_POLICY,
  OWNER_WORKBOOK_INTERPRETATION,
  OWNER_WORKBOOK_STOPS,
  EXTERNAL_SERVICE_DISCLAIMER_KEY,
  EXTERNAL_SERVICE_DISCLAIMER_TH,
  buildPublishedScheduleV1DryRun,
  validatePublishedSchedule
};
