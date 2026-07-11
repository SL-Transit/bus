#!/usr/bin/env node
'use strict';

const { buildDryRunSnapshot } = require('./erp-data-center-dry-run-snapshot.js');

const ESTIMATED_BADGE_TH = 'เวลาโดยประมาณ';
const ESTIMATED_DISCLAIMER_KEY = 'estimated_travel_time_may_change';
const ESTIMATED_DISCLAIMER_TH = 'เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง';
const TRANSFER_UNKNOWN_DISCLAIMER_KEY = 'transfer_feasibility_not_confirmed';
const TRANSFER_UNKNOWN_DISCLAIMER_TH = 'ข้อมูลต่อรถเป็นข้อมูลอ้างอิง ต้องยืนยันจุดต่อรถและความพร้อมให้บริการก่อนใช้งานจริง';
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
    if (pair.transferStatus === 'unknown' && !pair.transferDisclaimerTh) {
      block('unknown-transfer-missing-disclaimer', `publishedSchedule/pairs/${pairKey}`);
    }
    if (pair.transferStatus === 'unknown') {
      if (pair.referenceOnly !== true || pair.routeChoiceStatus !== 'unavailable_reference') {
        block('unknown-transfer-not-reference-unavailable', `publishedSchedule/pairs/${pairKey}`);
      }
    }
    (pair.segments || []).forEach((segment, segmentIndex) => {
      if (pair.transferStatus === 'unknown' && (!segment.times || segment.times.length === 0)) {
        if (segment.referenceOnly !== true || segment.unavailable !== true || segment.availabilityStatus !== 'needs_confirmation') {
          block('empty-transfer-segment-not-marked-unavailable', `publishedSchedule/pairs/${pairKey}/segments/${segmentIndex}`);
        }
      }
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
  const transferRuleByPair = values(erp.transferRules).reduce((map, rule) => {
    map[`${rule.originStopKey}__${rule.destStopKey}`] = rule;
    return map;
  }, {});
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
      const transferRule = transferRuleByPair[`${offer.originDestinationId}__${offer.destinationId}`];
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
        transfer: transferRule ? { required: true, viaStopKey: transferRule.viaStopKey } : null,
        transferStatus: transferRule ? 'unknown' : 'not_required',
        transferDisclaimerKey: transferRule ? TRANSFER_UNKNOWN_DISCLAIMER_KEY : null,
        transferDisclaimerTh: transferRule ? TRANSFER_UNKNOWN_DISCLAIMER_TH : null,
        transferRuleId: transferRule ? transferRule.transferRuleId : null,
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
    if (!pairs[pairKey]) {
      pairs[pairKey] = buildTransferReferencePair(rule, originLabel, destinationLabel, viaDestination.displayNameTh);
      return;
    }
    pairs[pairKey].transfer = { required: true, viaStopKey: rule.viaStopKey };
    pairs[pairKey].transferStatus = 'unknown';
    pairs[pairKey].referenceOnly = true;
    pairs[pairKey].previewDisplayMode = 'reference_needs_confirmation';
    pairs[pairKey].routeChoiceStatus = 'unavailable_reference';
    pairs[pairKey].unavailableReasonCode = 'transfer_feasibility_unknown';
    pairs[pairKey].transferDisclaimerKey = TRANSFER_UNKNOWN_DISCLAIMER_KEY;
    pairs[pairKey].transferDisclaimerTh = TRANSFER_UNKNOWN_DISCLAIMER_TH;
    pairs[pairKey].transferRuleId = rule.transferRuleId;
    pairs[pairKey].sourceLineage = pairs[pairKey].sourceLineage.concat(rule.sourceLineage || []);
  });

  Object.keys(pairs).forEach((pairKey) => {
    pairs[pairKey].segments.forEach((segment) => {
      segment.times.sort((a, b) => a.time.localeCompare(b.time));
    });
  });

  const mappingStatusSummary = summarizeMappingStatus(erp.scheduleOffers);
  const timeTypeSummary = summarizeTimeTypes(pairs);
  const transferUnknownPairs = values(pairs).filter((pair) => pair.transferStatus === 'unknown').length;
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
      externalServiceDisclaimerKey: EXTERNAL_SERVICE_DISCLAIMER_KEY,
      externalServiceDisclaimerTh: EXTERNAL_SERVICE_DISCLAIMER_TH
    },
    counts: {
      origins: origins.length,
      destinations: Object.keys(destinations).length,
      pairs: Object.keys(pairs).length,
      scheduleOfferTimes: values(erp.scheduleOffers).length,
      transferUnknownPairs,
      transferReferencePairs: values(pairs).filter((pair) => pair.transferStatus === 'unknown' && pair.referenceOnly === true).length,
      estimatedReferenceTimes
    },
    mappingStatusSummary,
    timeTypeSummary,
    origins,
    destinations,
    compatibilityKeyIndex,
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
  EXTERNAL_SERVICE_DISCLAIMER_KEY,
  EXTERNAL_SERVICE_DISCLAIMER_TH,
  buildPublishedScheduleV1DryRun,
  validatePublishedSchedule
};
