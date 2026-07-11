'use strict';

const assert = require('assert');
const {
  ESTIMATED_BADGE_TH,
  ESTIMATED_DISCLAIMER_KEY,
  EXTERNAL_SERVICE_DISCLAIMER_KEY,
  buildPublishedScheduleV1DryRun,
  validatePublishedSchedule
} = require('../tools/published-schedule-v1-dry-run.js');

function values(map) {
  return Object.keys(map || {}).map((key) => map[key]);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function countTimes(publishedSchedule) {
  return values(publishedSchedule.pairs).reduce((total, pair) => total + (pair.segments || []).reduce((segTotal, segment) => {
    return segTotal + (segment.times || []).length;
  }, 0), 0);
}

function firstEstimatedTime(publishedSchedule) {
  for (const pair of values(publishedSchedule.pairs)) {
    for (const segment of pair.segments || []) {
      const time = (segment.times || []).find((entry) => entry.isEstimated === true);
      if (time) return time;
    }
  }
  return null;
}

function firstUnknownTransferPair(publishedSchedule) {
  return values(publishedSchedule.excludedPreviewPairs && publishedSchedule.excludedPreviewPairs.transferUnknown || {})
    .find((pair) => pair.transferStatus === 'unknown');
}

function firstExternalTime(publishedSchedule) {
  for (const pair of values(publishedSchedule.pairs)) {
    for (const segment of pair.segments || []) {
      const time = (segment.times || []).find((entry) => entry.mappingStatus === 'external_schedule');
      if (time) return time;
    }
  }
  return null;
}

function firstVisiblePair(publishedSchedule) {
  return values(publishedSchedule.pairs)[0] || null;
}

function firstEmptyUnknownTransferPair(publishedSchedule) {
  return values(publishedSchedule.excludedPreviewPairs && publishedSchedule.excludedPreviewPairs.transferUnknown || {}).find((pair) => (
    pair.transferStatus === 'unknown' &&
    pair.referenceOnly === true &&
    (pair.segments || []).some((segment) => !segment.times || segment.times.length === 0)
  ));
}

(async function main() {
  const result = await buildPublishedScheduleV1DryRun();
  const schedule = result.publishedSchedule;

  assert(result.dryRun === true, 'builder must be dry-run');
  assert(result.writesEnabled === false, 'writes must remain disabled');
  assert(result.readyForApply === false, 'builder must not be apply-ready');
  assert(result.targetPath === 'publishedSchedule', 'target path must be top-level publishedSchedule');
  assert(schedule.publicationStatus === 'preview', 'publication status must be preview');
  assert(schedule.productionReady === false, 'productionReady must remain false');
  assert(schedule.readyForApply === false, 'published schedule must not be apply-ready');
  assert(result.validation.readyForReview === true, 'publishedSchedule should be review-ready');
  assert(result.validation.readyForApply === false, 'publishedSchedule validation must not be apply-ready');
  assert(result.validation.blockers.length === 0, `unexpected blockers: ${JSON.stringify(result.validation.blockers)}`);

  assert(schedule.counts.origins === 15, 'Phase 1 preview must expose 15 origin-selectable group_001 stops');
  assert(schedule.counts.destinations === 49, 'Phase 1 preview must expose 49 destination labels');
  assert(schedule.counts.scheduleOfferTimes === 819, 'all schedule offers must be represented once');
  assert(countTimes(schedule) === 819, 'rendered time rows must equal source schedule offers');
  assert(schedule.mappingStatusSummary.mapped_queue_trip === 352, 'mapped_queue_trip count mismatch');
  assert(schedule.mappingStatusSummary.estimated_schedule === 73, 'estimated_schedule count mismatch');
  assert(schedule.mappingStatusSummary.departure_only === 262, 'departure_only count mismatch');
  assert(schedule.mappingStatusSummary.external_schedule === 132, 'external_schedule count mismatch');
  assert((schedule.mappingStatusSummary.needs_review || 0) === 0, 'needs_review must be zero');
  assert(schedule.counts.pairs === 207, 'visible pair count mismatch');
  assert(schedule.counts.visiblePairs === 207, 'visible pair count alias mismatch');
  assert(schedule.counts.transferUnknownPairs === 322, 'transfer unknown count mismatch');
  assert(schedule.counts.transferReferencePairs === 322, 'transfer reference count mismatch');
  assert(schedule.counts.excludedFromPreview.transferUnknown === 322, 'excluded transfer unknown count mismatch');
  assert(schedule.counts.estimatedReferenceTimes === 360, 'estimated reference time count mismatch');

  values(schedule.pairs).forEach((pair) => {
    assert(pair.keyType === 'compatibility_label_pair', 'pair map key must be marked as compatibility label key');
    assert(pair.compatibilityOnly === true, 'compatibility pair key must be compatibility-only');
    assert(pair.compatibilityPairKey, 'compatibilityPairKey missing');
    assert(pair.pairId === pair.canonicalPairKey, 'pairId must use canonical stable key');
    assert(pair.pairId !== pair.compatibilityPairKey, 'pairId must not be label-derived');
    assert(pair.canonicalPairKey.indexOf(pair.originLabel) === -1, 'canonical key must not include origin label');
    assert(pair.canonicalPairKey.indexOf(pair.destinationLabel) === -1, 'canonical key must not include destination label');
    assert(schedule.compatibilityKeyIndex[pair.compatibilityPairKey].canonicalPairKey === pair.canonicalPairKey, 'compatibility key index mismatch');
  });

  assert(values(schedule.pairs).every((pair) => pair.transferStatus !== 'unknown'), 'transfer unknown pairs must be hidden from Passenger Preview pairs');

  assert(schedule.origins.indexOf('ฉะเชิงเทรา (แปดริ้ว)') !== -1, 'origin list must include Chachoengsao display label');
  assert(schedule.destinations['หมอชิต'], 'destination list must include Bangkok destination');
  assert(schedule.destinations['หมอชิต'].referenceOnly === true, 'non-origin destination must display as reference destination');

  const estimated = firstEstimatedTime(schedule);
  assert(estimated, 'must include estimated/reference time entries');
  assert(estimated.referenceOnly === true, 'estimated time must be referenceOnly');
  assert(estimated.displayBadgeTh === ESTIMATED_BADGE_TH, 'estimated time must expose Thai display badge');
  assert(estimated.disclaimerKey === ESTIMATED_DISCLAIMER_KEY, 'estimated time must expose disclaimer key');
  assert(estimated.disclaimerTh, 'estimated time must expose Thai disclaimer');
  assert(estimated.passengerDisplayMode === 'reference', 'referenceOnly means display as reference, not disabled');
  assert(estimated.disabled === false, 'referenceOnly time must not be disabled');

  const unknownTransfer = firstUnknownTransferPair(schedule);
  assert(unknownTransfer, 'must retain transfer-rule-backed pairs in excludedPreviewPairs');
  assert(unknownTransfer.transfer && unknownTransfer.transfer.required === true, 'unknown transfer pair must carry transfer metadata');
  assert(unknownTransfer.transferDisclaimerTh, 'unknown transfer pair must carry disclaimer');
  assert(unknownTransfer.referenceOnly === true, 'unknown transfer pair must be reference-only');
  assert(unknownTransfer.routeChoiceStatus === 'unavailable_reference', 'unknown transfer pair must not look like confirmed active route choice');

  const emptyUnknownTransfer = firstEmptyUnknownTransferPair(schedule);
  assert(emptyUnknownTransfer, 'must include empty transfer reference pairs');
  emptyUnknownTransfer.segments.forEach((segment) => {
    assert(segment.referenceOnly === true, 'empty transfer segment must be reference-only');
    assert(segment.unavailable === true, 'empty transfer segment must be unavailable');
    assert(segment.availabilityStatus === 'needs_confirmation', 'empty transfer segment must require confirmation');
  });

  const external = firstExternalTime(schedule);
  assert(external, 'must include external_schedule time entries');
  assert(external.referenceOnly === true, 'external_schedule must be reference-only');
  assert(external.externalReference === true, 'external_schedule must expose externalReference');
  assert(external.passengerDisplayMode === 'external_reference', 'external_schedule must use external reference display mode');
  assert(external.disclaimerKey === EXTERNAL_SERVICE_DISCLAIMER_KEY, 'external_schedule must expose external disclaimer');
  assert(external.slTransitFareCollection === false, 'external_schedule must not imply SL-Transit fare collection');

  values(schedule.pairs).forEach((pair) => {
    (pair.segments || []).forEach((segment) => {
      (segment.times || []).forEach((time) => {
        assert(!time.gps && !time.eta && !time.vehicleId && !time.assignmentId, 'publishedSchedule must not claim operational state');
      });
    });
  });

  const missingEstimatedBadge = clone(schedule);
  firstEstimatedTime(missingEstimatedBadge).displayBadgeTh = null;
  assert(validatePublishedSchedule(missingEstimatedBadge).blockers.some((blocker) => blocker.code === 'estimated-time-badge-missing'), 'missing estimated badge must fail validation');

  const labelDerivedId = clone(schedule);
  const labelPair = firstVisiblePair(labelDerivedId);
  labelPair.pairId = labelPair.compatibilityPairKey;
  labelPair.canonicalPairKey = labelPair.compatibilityPairKey;
  assert(validatePublishedSchedule(labelDerivedId).blockers.some((blocker) => blocker.code === 'label-derived-canonical-pair-id'), 'label-derived canonical pair ID must fail validation');

  const missingCompatibilityMark = clone(schedule);
  firstVisiblePair(missingCompatibilityMark).compatibilityOnly = false;
  assert(validatePublishedSchedule(missingCompatibilityMark).blockers.some((blocker) => blocker.code === 'compatibility-pair-key-not-marked'), 'compatibility pair key must be marked compatibility-only');

  const collisionIndex = clone(schedule);
  const collisionPair = firstVisiblePair(collisionIndex);
  collisionIndex.compatibilityKeyIndex[collisionPair.compatibilityPairKey].canonicalPairKey = 'psv1_pair_wrong_collision';
  assert(validatePublishedSchedule(collisionIndex).blockers.some((blocker) => blocker.code === 'compatibility-key-index-missing'), 'compatibility key collision/index mismatch must fail validation');

  const visibleUnknownTransfer = clone(schedule);
  const hiddenTransfer = firstUnknownTransferPair(visibleUnknownTransfer);
  visibleUnknownTransfer.pairs[hiddenTransfer.compatibilityPairKey] = hiddenTransfer;
  visibleUnknownTransfer.compatibilityKeyIndex[hiddenTransfer.compatibilityPairKey] = {
    keyType: 'compatibility_label_pair',
    compatibilityOnly: true,
    canonicalPairKey: hiddenTransfer.canonicalPairKey,
    originLabel: hiddenTransfer.originLabel,
    destinationLabel: hiddenTransfer.destinationLabel
  };
  assert(validatePublishedSchedule(visibleUnknownTransfer).blockers.some((blocker) => blocker.code === 'unknown-transfer-visible-in-preview'), 'visible unknown transfer must fail validation');

  const missingTransferDisclaimer = clone(schedule);
  firstUnknownTransferPair(missingTransferDisclaimer).transferDisclaimerTh = null;
  assert(validatePublishedSchedule(missingTransferDisclaimer).blockers.some((blocker) => blocker.code === 'excluded-transfer-missing-disclaimer'), 'excluded unknown transfer without disclaimer must fail validation');

  const activeUnknownTransfer = clone(schedule);
  firstUnknownTransferPair(activeUnknownTransfer).routeChoiceStatus = 'preview_available';
  assert(validatePublishedSchedule(activeUnknownTransfer).blockers.some((blocker) => blocker.code === 'excluded-transfer-not-reference-unavailable'), 'excluded unknown transfer must remain unavailable/reference');

  const unsafeEmptyTransfer = clone(schedule);
  firstEmptyUnknownTransferPair(unsafeEmptyTransfer).segments[0].unavailable = false;
  assert(validatePublishedSchedule(unsafeEmptyTransfer).blockers.some((blocker) => blocker.code === 'excluded-transfer-segment-not-marked-unavailable'), 'empty transfer segment must be marked unavailable/reference');

  const unsafeExternal = clone(schedule);
  firstExternalTime(unsafeExternal).referenceOnly = false;
  assert(validatePublishedSchedule(unsafeExternal).blockers.some((blocker) => blocker.code === 'external-schedule-not-reference'), 'external_schedule without reference flag must fail validation');

  const operationalClaim = clone(schedule);
  firstEstimatedTime(operationalClaim).eta = { minutes: 5 };
  assert(validatePublishedSchedule(operationalClaim).blockers.some((blocker) => blocker.code === 'operational-claim-forbidden'), 'operational ETA claim must fail validation');

  const applyReady = clone(schedule);
  applyReady.readyForApply = true;
  assert(validatePublishedSchedule(applyReady).blockers.some((blocker) => blocker.code === 'ready-for-apply-not-false'), 'readyForApply=true must fail validation');

  console.log('publishedSchedule v1 dry-run ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
