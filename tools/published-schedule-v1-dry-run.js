#!/usr/bin/env node
'use strict';

const { buildDryRunSnapshot } = require('./erp-data-center-dry-run-snapshot.js');

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
const EXTERNAL_SERVICE_DISCLAIMER_KEY = 'external_service_confirm_outside_sl_transit';
const EXTERNAL_SERVICE_DISCLAIMER_TH = 'บริการหรือค่าโดยสารนี้ต้องชำระหรือยืนยันภายนอกระบบ SL-Transit';
const FORBIDDEN_OPERATIONAL_FIELDS = ['gps', 'eta', 'vehicleId', 'assignmentId', 'liveVehicleId', 'liveTrackingAvailable', 'driverId'];

function values(map) {
  return Object.keys(map || {}).map((key) => map[key]);
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
    workbook: TRANSFER_POLICY.sourceWorkbook,
    sheet: TRANSFER_POLICY.policySheetName,
    rows: TRANSFER_POLICY.policySheetRows,
    minTransferMinutes: TRANSFER_POLICY.minTransferMinutes,
    idealWaitMinutes: TRANSFER_POLICY.idealWaitMinutes,
    maxRecommendedWaitMinutes: TRANSFER_POLICY.maxRecommendedWaitMinutes
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
    workbook: TRANSFER_POLICY.sourceWorkbook,
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
  const group = serviceGroups[groupId];
  return group && (group.displayNameTh || group.nameTh || group.serviceGroupId) || groupId || null;
}

function timeEntryFromOffer(offer) {
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
  return entry;
}

function addTimeToPair(pair, offer, originLabel, destinationLabel) {
  if (!pair.segments.length) {
    pair.segments.push({
      label: 'ตารางเวลา',
      fromLabel: originLabel,
      toLabel: destinationLabel,
      times: []
    });
  }
  pair.segments[0].times.push(timeEntryFromOffer(offer));
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
    candidateCount: audit.candidateCount,
    feasibleCandidateCount: audit.feasibleCandidateCount,
    boardingPoint: audit.boardingPoint
  };
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

  const pairs = publishedSchedule.pairs || {};
  const compatibilityKeyIndex = publishedSchedule.compatibilityKeyIndex || {};
  const excludedTransferPairs = publishedSchedule.excludedPreviewPairs && publishedSchedule.excludedPreviewPairs.transferUnknown || {};
  const excludedInfeasibleTransferPairs = publishedSchedule.excludedPreviewPairs && publishedSchedule.excludedPreviewPairs.transferInfeasible || {};
  const scheduleOfferIds = [];
  const canonicalKeys = new Set();
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
    addTimeToPair(pairs[pairKey], offer, originLabel, destinationLabel);
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
      sourcePaths: [
        'data/erpDataCenter/destinations',
        'data/erpDataCenter/scheduleOffers',
        'data/erpDataCenter/transferRules'
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
      estimatedReferenceTimes
    },
    mappingStatusSummary,
    timeTypeSummary,
    origins,
    destinations,
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
  EXTERNAL_SERVICE_DISCLAIMER_KEY,
  EXTERNAL_SERVICE_DISCLAIMER_TH,
  buildPublishedScheduleV1DryRun,
  validatePublishedSchedule
};
