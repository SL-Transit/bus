'use strict';

const assert = require('assert');
const {
  ESTIMATED_BADGE_TH,
  ESTIMATED_DISCLAIMER_KEY,
  EXTERNAL_SERVICE_DISCLAIMER_KEY,
  TRANSFER_REFERENCE_BADGE_TH,
  TRANSFER_REFERENCE_DISCLAIMER_KEY,
  TRANSFER_REFERENCE_DISCLAIMER_TH,
  TRANSFER_POLICY,
  OWNER_WORKBOOK_INTERPRETATION,
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

function firstFeasibleTransferPair(publishedSchedule) {
  return values(publishedSchedule.pairs).find((pair) => pair.transferStatus === 'feasible_reference');
}

function firstInfeasibleTransferPair(publishedSchedule) {
  return values(publishedSchedule.excludedPreviewPairs && publishedSchedule.excludedPreviewPairs.transferInfeasible || {})
    .find((pair) => pair.transferStatus === 'infeasible');
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
  return values(publishedSchedule.excludedPreviewPairs && publishedSchedule.excludedPreviewPairs.transferInfeasible || {}).find((pair) => (
    pair.transferStatus === 'infeasible' &&
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
  assert(schedule.counts.pairs === 471, 'visible pair count mismatch');
  assert(schedule.counts.visiblePairs === 471, 'visible pair count alias mismatch');
  assert(schedule.counts.transferUnknownPairs === 0, 'transfer unknown count mismatch');
  assert(schedule.counts.transferReferencePairs === 264, 'transfer reference count mismatch');
  assert(schedule.counts.transferFeasibleReferencePairs === 264, 'transfer feasible reference count mismatch');
  assert(schedule.counts.transferInfeasibleAuditPairs === 58, 'transfer infeasible audit count mismatch');
  assert(schedule.counts.excludedFromPreview.transferUnknown === 0, 'excluded transfer unknown count mismatch');
  assert(schedule.counts.excludedFromPreview.transferInfeasible === 58, 'excluded transfer infeasible count mismatch');
  assert(schedule.counts.estimatedReferenceTimes === 360, 'estimated reference time count mismatch');

  assert(TRANSFER_POLICY.sourceWorkbook === OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook, 'transfer policy source workbook must use latest owner workbook');
  assert(schedule.source.ownerWorkbook === OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook, 'latest owner workbook source mismatch');
  assert(schedule.displayPolicy.transferReferencePolicy.workbook === OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook, 'transfer policy evidence must cite latest workbook');
  assert(schedule.ownerWorkbookInterpretation.sourceWorkbook === OWNER_WORKBOOK_INTERPRETATION.sourceWorkbook, 'owner workbook interpretation source mismatch');
  assert(schedule.ownerWorkbookInterpretation.stopSequence.stopCountPolicy === 'route_sequence_version_dynamic', 'stop count must be versioned/dynamic');
  assert(schedule.ownerWorkbookInterpretation.stopSequence.currentActiveStopCount === schedule.counts.origins, 'interpretation stop count must come from dry-run origins');
  assert(schedule.ownerWorkbookInterpretation.stopSequence.currentExpectedDestinationsPerOrigin === schedule.counts.origins - 1, 'per-origin destination rows must be derived from stop count');
  assert(schedule.ownerWorkbookInterpretation.routeIdentity.routeIdIsUniqueOdId === false, 'Sheet 03 route_id must not be treated as unique OD ID');
  assert(schedule.ownerWorkbookInterpretation.routeIdentity.duplicateOriginBucketsAllowedOnlyWhenDestinationKeyDiffers === true, 'origin bucket duplicate rule missing');
  assert(schedule.ownerWorkbookInterpretation.routeIdentity.uniqueOdIdentityFields.indexOf('originStopKey') !== -1, 'OD identity must include origin stop key');
  assert(schedule.ownerWorkbookInterpretation.routeIdentity.uniqueOdIdentityFields.indexOf('destinationKey') !== -1, 'OD identity must include destination key');
  assert(schedule.ownerWorkbookInterpretation.bookingAvailability.defaultWhenBlank === 'open', 'blank booking cells must default open');
  assert(schedule.ownerWorkbookInterpretation.bookingAvailability.blankMeansClosed === false, 'blank booking cells must not mean closed');
  assert(schedule.ownerWorkbookInterpretation.bookingAvailability.specialOverrides.wangNamYen.bookingEligible === false, 'Wang Nam Yen booking override must be disabled');
  assert(schedule.ownerWorkbookInterpretation.transferPolicy.globalTransferHub === null, 'global transfer hub must not be configured');
  assert(schedule.ownerWorkbookInterpretation.transferPolicy.transferNodeScope === 'per_journey_candidate', 'transfer node must be per journey candidate');
  assert(schedule.ownerWorkbookInterpretation.queueCodeInterpretation.numericQueueCodeMap['5'] === 'Q_005', 'numeric queue code 5 must map to Q_005');
  assert(schedule.ownerWorkbookInterpretation.queueCodeInterpretation.q005FallbackPolicy.source === 'owner_approved_policy', 'Q_005 fallback must preserve owner-approved lineage');
  assert(schedule.ownerWorkbookInterpretation.vehicleDriverLogin.previewOnly === true, 'vehicle/driver/login data must be preview-only');
  assert(schedule.ownerWorkbookInterpretation.vehicleDriverLogin.productionCredentialUseAllowed === false, 'preview credentials must not be production-ready');

  values(schedule.pairs).forEach((pair) => {
    assert(pair.keyType === 'compatibility_label_pair', 'pair map key must be marked as compatibility label key');
    assert(pair.compatibilityOnly === true, 'compatibility pair key must be compatibility-only');
    assert(pair.compatibilityPairKey, 'compatibilityPairKey missing');
    assert(pair.originDestinationId && pair.destinationId, 'OD pair identity must include origin and destination IDs');
    assert(pair.pairId === pair.canonicalPairKey, 'pairId must use canonical stable key');
    assert(pair.pairId !== pair.compatibilityPairKey, 'pairId must not be label-derived');
    assert(pair.canonicalPairKey.indexOf(pair.originLabel) === -1, 'canonical key must not include origin label');
    assert(pair.canonicalPairKey.indexOf(pair.destinationLabel) === -1, 'canonical key must not include destination label');
    assert(schedule.compatibilityKeyIndex[pair.compatibilityPairKey].canonicalPairKey === pair.canonicalPairKey, 'compatibility key index mismatch');
    if (pair.originDestinationId === 'wangnamyen' || pair.destinationId === 'wangnamyen') {
      assert(pair.bookingEligible !== true, 'Wang Nam Yen must not be booking eligible in preview');
    }
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

  const feasibleTransfer = firstFeasibleTransferPair(schedule);
  assert(feasibleTransfer, 'must expose feasible transfer pairs as visible references');
  assert(feasibleTransfer.transfer && feasibleTransfer.transfer.required === true, 'feasible transfer pair must carry transfer metadata');
  assert(feasibleTransfer.transferStatus === 'feasible_reference', 'feasible transfer pair must be marked feasible_reference');
  assert(feasibleTransfer.routeChoiceStatus === 'reference_only', 'feasible transfer must be reference only');
  assert(feasibleTransfer.previewDisplayMode === 'transfer_reference', 'feasible transfer display mode mismatch');
  assert(feasibleTransfer.referenceOnly === true, 'feasible transfer pair must be reference-only');
  assert(feasibleTransfer.bookingEligible === false, 'feasible transfer must not be booking eligible');
  assert(feasibleTransfer.guaranteedTransfer === false, 'feasible transfer must not claim a guaranteed connection');
  assert(feasibleTransfer.displayBadgeTh === TRANSFER_REFERENCE_BADGE_TH, 'feasible transfer badge mismatch');
  assert(feasibleTransfer.transferDisclaimerKey === TRANSFER_REFERENCE_DISCLAIMER_KEY, 'feasible transfer disclaimer key mismatch');
  assert(feasibleTransfer.transferDisclaimerTh === TRANSFER_REFERENCE_DISCLAIMER_TH, 'feasible transfer disclaimer mismatch');
  assert(feasibleTransfer.transferTiming.bestConnection.waitMinutes >= TRANSFER_POLICY.minTransferMinutes, 'feasible transfer wait below policy');
  assert(feasibleTransfer.transferTiming.bestConnection.waitMinutes <= TRANSFER_POLICY.maxRecommendedWaitMinutes, 'feasible transfer wait above policy');
  assert(feasibleTransfer.transferTiming.bestConnection.sourceEvidence.transferRule.length > 0, 'feasible transfer must preserve source evidence');

  const infeasibleTransfer = firstInfeasibleTransferPair(schedule);
  assert(infeasibleTransfer, 'must retain infeasible transfer pairs in excludedPreviewPairs');
  assert(infeasibleTransfer.transferStatus === 'infeasible', 'infeasible transfer status mismatch');
  assert(infeasibleTransfer.infeasibleReason.indexOf('wait time outside policy') !== -1, 'infeasible transfer reason mismatch');
  assert(infeasibleTransfer.routeChoiceStatus === 'unavailable_reference', 'infeasible transfer must stay hidden/unavailable');
  assert(infeasibleTransfer.bookingEligible === false, 'infeasible transfer must not be booking eligible');
  assert(infeasibleTransfer.guaranteedTransfer === false, 'infeasible transfer must not claim a guaranteed connection');

  const emptyUnknownTransfer = firstEmptyUnknownTransferPair(schedule);
  assert(emptyUnknownTransfer, 'must include hidden infeasible transfer reference pairs');
  emptyUnknownTransfer.segments.forEach((segment) => {
    assert(segment.referenceOnly === true, 'hidden transfer segment must be reference-only');
    assert(segment.unavailable === true, 'hidden transfer segment must be unavailable');
    assert(segment.availabilityStatus === 'infeasible', 'hidden transfer segment must be marked infeasible');
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

  const hardCodedStopCount = clone(schedule);
  hardCodedStopCount.ownerWorkbookInterpretation.stopSequence.stopCountPolicy = 'fixed_15_stops';
  assert(validatePublishedSchedule(hardCodedStopCount).blockers.some((blocker) => blocker.code === 'stop-count-hard-coded-policy'), 'hard-coded stop count policy must fail validation');

  const duplicateOriginBucketAsOd = clone(schedule);
  duplicateOriginBucketAsOd.ownerWorkbookInterpretation.routeIdentity.routeIdIsUniqueOdId = true;
  assert(validatePublishedSchedule(duplicateOriginBucketAsOd).blockers.some((blocker) => blocker.code === 'origin-bucket-duplicate-policy-missing'), 'Sheet 03 route_id unique-OD interpretation must fail validation');

  const missingDestinationIdentity = clone(schedule);
  missingDestinationIdentity.ownerWorkbookInterpretation.routeIdentity.uniqueOdIdentityFields = ['originBucketCode', 'originStopKey'];
  assert(validatePublishedSchedule(missingDestinationIdentity).blockers.some((blocker) => blocker.code === 'od-identity-must-include-origin-destination'), 'OD identity without destination key must fail validation');

  const blankBookingClosed = clone(schedule);
  blankBookingClosed.ownerWorkbookInterpretation.bookingAvailability.blankMeansClosed = true;
  assert(validatePublishedSchedule(blankBookingClosed).blockers.some((blocker) => blocker.code === 'booking-blank-default-policy-missing'), 'blank booking closed interpretation must fail validation');

  const wangNamYenOpen = clone(schedule);
  wangNamYenOpen.ownerWorkbookInterpretation.bookingAvailability.specialOverrides.wangNamYen.bookingEligible = true;
  assert(validatePublishedSchedule(wangNamYenOpen).blockers.some((blocker) => blocker.code === 'wang-nam-yen-booking-override-missing'), 'missing Wang Nam Yen disabled override must fail validation');

  const globalTransferHub = clone(schedule);
  globalTransferHub.ownerWorkbookInterpretation.transferPolicy.globalTransferHub = 'chachoengsao';
  assert(validatePublishedSchedule(globalTransferHub).blockers.some((blocker) => blocker.code === 'global-transfer-hub-forbidden'), 'global transfer hub must fail validation');

  const q005WithoutLineage = clone(schedule);
  q005WithoutLineage.ownerWorkbookInterpretation.queueCodeInterpretation.q005FallbackPolicy.source = 'sheet05';
  assert(validatePublishedSchedule(q005WithoutLineage).blockers.some((blocker) => blocker.code === 'q005-owner-policy-lineage-missing'), 'Q_005 fallback without owner lineage must fail validation');

  const productionCredentials = clone(schedule);
  productionCredentials.ownerWorkbookInterpretation.vehicleDriverLogin.productionCredentialUseAllowed = true;
  assert(validatePublishedSchedule(productionCredentials).blockers.some((blocker) => blocker.code === 'preview-credentials-production-forbidden'), 'production credential interpretation must fail validation');

  const pairWithoutOdIdentity = clone(schedule);
  firstVisiblePair(pairWithoutOdIdentity).destinationId = null;
  assert(validatePublishedSchedule(pairWithoutOdIdentity).blockers.some((blocker) => blocker.code === 'od-identity-missing-on-pair'), 'pair without destination identity must fail validation');

  const visibleUnknownTransfer = clone(schedule);
  const hiddenTransfer = firstInfeasibleTransferPair(visibleUnknownTransfer);
  hiddenTransfer.transferStatus = 'unknown';
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
  firstFeasibleTransferPair(missingTransferDisclaimer).transferDisclaimerTh = null;
  assert(validatePublishedSchedule(missingTransferDisclaimer).blockers.some((blocker) => blocker.code === 'feasible-transfer-display-policy-missing'), 'feasible transfer without disclaimer must fail validation');

  const activeUnknownTransfer = clone(schedule);
  firstInfeasibleTransferPair(activeUnknownTransfer).routeChoiceStatus = 'preview_available';
  assert(validatePublishedSchedule(activeUnknownTransfer).blockers.some((blocker) => blocker.code === 'excluded-infeasible-transfer-not-unavailable'), 'excluded infeasible transfer must remain unavailable/reference');

  const unsafeEmptyTransfer = clone(schedule);
  firstEmptyUnknownTransferPair(unsafeEmptyTransfer).segments[0].unavailable = false;
  assert(validatePublishedSchedule(unsafeEmptyTransfer).blockers.some((blocker) => blocker.code === 'excluded-infeasible-transfer-segment-not-hidden'), 'hidden transfer segment must be marked unavailable/reference');

  const bookingTransfer = clone(schedule);
  firstFeasibleTransferPair(bookingTransfer).bookingEligible = true;
  assert(validatePublishedSchedule(bookingTransfer).blockers.some((blocker) => blocker.code === 'feasible-transfer-operational-claim'), 'feasible transfer must not allow booking');

  const guaranteedTransfer = clone(schedule);
  firstFeasibleTransferPair(guaranteedTransfer).guaranteedTransfer = true;
  assert(validatePublishedSchedule(guaranteedTransfer).blockers.some((blocker) => blocker.code === 'feasible-transfer-operational-claim'), 'feasible transfer must not claim a guarantee');

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
