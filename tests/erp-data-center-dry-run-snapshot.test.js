'use strict';

const {
  STARTING_SHA,
  TARGET_COUNTS,
  buildDryRunSnapshot,
  validateReferences
} = require('../tools/erp-data-center-dry-run-snapshot.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function values(value) {
  return Object.values(value || {});
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertCustomBlock(erp, code) {
  const validation = validateReferences(erp);
  assert(validation.blockers.some((blocker) => blocker.code === code), `expected validation blocker: ${code}`);
}

const EXPECTED_SEQUENCES = {
  rsv_000001: ['g01p003', 'g01p002', 'g01p001'],
  rsv_000002: Array.from({ length: 15 }, (_, index) => `g01p${String(index + 1).padStart(3, '0')}`),
  rsv_000003: Array.from({ length: 15 }, (_, index) => `g01p${String(15 - index).padStart(3, '0')}`),
  rsv_000004: ['g01p001', 'g01p002', 'g01p003'],
  rsv_000005: ['g01p008', 'g01p007', 'g01p003', 'g01p002', 'g01p001'],
  rsv_000006: ['g01p001', 'g01p002', 'g01p003', 'g01p007', 'g01p008']
};

const EXPECTED_TRIP_MAPPINGS = {
  'TRIP-ROUTE-MAIN-004-0900': 'rsv_000001',
  'TRIP-ROUTE-MAIN-021-1120': 'rsv_000002',
  'TRIP-ROUTE-MAIN-022-0800': 'rsv_000003',
  'TRIP-ROUTE-MAIN-003-1220': 'rsv_000004',
  'TRIP-ROUTE-MAIN-004-1340': 'rsv_000001',
  'TRIP-ROUTE-MAIN-003-1520': 'rsv_000004',
  'TRIP-ROUTE-MAIN-004-0620': 'rsv_000001',
  'TRIP-ROUTE-MAIN-003-0940': 'rsv_000004',
  'TRIP-ROUTE-MAIN-004-1210': 'rsv_000001',
  'TRIP-ROUTE-MAIN-021-1400': 'rsv_000002',
  'TRIP-ROUTE-MAIN-022-1130': 'rsv_000003',
  'TRIP-ROUTE-MAIN-003-1620': 'rsv_000004',
  'TRIP-ROUTE-MAIN-008_1-0620': 'rsv_000005',
  'TRIP-ROUTE-MAIN-007_1-1720': 'rsv_000006'
};

(async () => {
  const result = await buildDryRunSnapshot();
  const erp = result.snapshot.erpDataCenter;

  assert(result.plan.dryRun === true, 'snapshot must be dry-run');
  assert(result.plan.writesEnabled === false, 'writes must be disabled');
  assert(result.plan.readyForApply === false, 'plan must not be apply-ready');
  assert(result.plan.startingSha === STARTING_SHA, 'starting SHA mismatch');
  assert(result.validation.readyForReview === true, 'snapshot should be review-ready');
  assert(result.validation.readyForApply === false, 'validation must not be apply-ready');
  assert(result.validation.blockers.length === 0, 'snapshot must not have blockers');
  assert(result.validation.warnings.length === 23, 'only legacy catalog compatibility warnings should remain');

  Object.keys(TARGET_COUNTS).forEach((key) => {
    assert(result.counts[key] === TARGET_COUNTS[key], `unexpected count ${key}: ${result.counts[key]} !== ${TARGET_COUNTS[key]}`);
  });
  assert(!erp.trips, '820 schedule offer records must not be physical trips');
  assert(Object.keys(erp.scheduleOffers).length === 820, 'must have 820 schedule offers');
  assert(JSON.stringify(result.validation.mappingStatusSummary) === JSON.stringify({ mapped_queue_trip: 353, estimated_schedule: 73, departure_only: 262, external_schedule: 132, needs_review: 0 }), 'schedule offer mapping summary mismatch');
  assert(JSON.stringify(result.validation.mappingStatusByGroup) === JSON.stringify({
    group_001: { mapped_queue_trip: 353, estimated_schedule: 73, departure_only: 0, external_schedule: 0, needs_review: 0 },
    group_002: { mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 47, external_schedule: 0, needs_review: 0 },
    group_003: { mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 207, external_schedule: 0, needs_review: 0 },
    group_004: { mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 8, external_schedule: 0, needs_review: 0 },
    group_005: { mapped_queue_trip: 0, estimated_schedule: 0, departure_only: 0, external_schedule: 132, needs_review: 0 }
  }), 'schedule offer group/status counts mismatch');

  values(erp.scheduleOffers).forEach((offer) => {
    assert(offer.recordType === 'schedule_offer', `recordType missing: ${offer.legacyPublishedTripId}`);
    assert(offer.mappingStatus, `mappingStatus missing: ${offer.legacyPublishedTripId}`);
    assert(offer.sourceLineage.length > 0, `source lineage missing: ${offer.legacyPublishedTripId}`);
    assert(offer.routeId && offer.serviceGroupId && offer.departureTime, `schedule evidence missing: ${offer.legacyPublishedTripId}`);
    assert(offer.originNodeId && offer.destinationNodeId, `schedule endpoints missing: ${offer.legacyPublishedTripId}`);
    assert(offer.isPhysicalServiceRun === false, `offer must not be a physical run: ${offer.legacyPublishedTripId}`);
    assert(!offer.vehicleId && !offer.assignmentId && !offer.dailyAssignmentId, `static offer contains runtime assignment: ${offer.legacyPublishedTripId}`);
    if (offer.mappingStatus === 'mapped_queue_trip') {
      assert(erp.fleet.queueTrips[offer.queueTripId], `mapped queue trip missing: ${offer.legacyPublishedTripId}`);
      assert(erp.routeSequenceVersions[offer.routeSequenceVersionId], `mapped sequence missing: ${offer.legacyPublishedTripId}`);
    } else {
      assert(!offer.queueTripId && !offer.routeSequenceVersionId, `unmapped offer has physical references: ${offer.legacyPublishedTripId}`);
    }
    if (offer.mappingStatus === 'estimated_schedule') {
      assert(offer.timeStatus === 'owner_estimated', `estimated timeStatus mismatch: ${offer.legacyPublishedTripId}`);
      assert(offer.timeType === 'estimated_pass_through', `estimated timeType mismatch: ${offer.legacyPublishedTripId}`);
      assert(offer.referenceOnly === true, `estimated top-level referenceOnly missing: ${offer.legacyPublishedTripId}`);
      assert(offer.isEstimated === true && offer.planningEligible === true, `estimated planning metadata missing: ${offer.legacyPublishedTripId}`);
      assert(offer.disclaimerKey === 'estimated_travel_time_may_change', `estimated disclaimer key missing: ${offer.legacyPublishedTripId}`);
      assert(offer.disclaimerTh === 'เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง', `estimated disclaimer text mismatch: ${offer.legacyPublishedTripId}`);
      assert(offer.estimatedTime === offer.departureTime, `estimated time not preserved: ${offer.legacyPublishedTripId}`);
      assert(offer.approvalLineage.length > 0, `owner approval lineage missing: ${offer.legacyPublishedTripId}`);
      assert(!offer.queueTripId && !offer.routeSequenceVersionId && !offer.vehicleId && !offer.assignmentId, `estimated offer contains physical claim: ${offer.legacyPublishedTripId}`);
    }
    if (offer.isEstimated) {
      assert(offer.disclaimerKey === 'estimated_travel_time_may_change', `estimated offer disclaimer missing: ${offer.legacyPublishedTripId}`);
      assert(offer.guaranteedPickupTime === false && offer.exactOperationalProof === false, `estimated offer claims exact pickup/operation: ${offer.legacyPublishedTripId}`);
      assert(offer.timeSemanticsLineage.length > 0, `estimated offer time lineage missing: ${offer.legacyPublishedTripId}`);
    }
  });
  assert(result.mappingReview.total === 0, 'owner-approved estimates must not remain needs_review');
  assert(result.estimatedScheduleSummary.total === 73, 'estimated schedule total mismatch');
  assert(result.estimatedScheduleSummary.byServiceGroup.group_001 === 73, 'estimated schedule service-group count mismatch');
  assert(result.estimatedScheduleSummary.byTimeType.scheduled_origin_departure === 0, 'owner estimates must not claim queue origin authority');
  assert(result.estimatedScheduleSummary.byTimeType.estimated_pass_through === 73, 'estimated pass-through count mismatch');
  assert(result.estimatedScheduleSummary.byTimeType.unresolved === 0, 'estimated timeType must be fully resolved');
  assert(result.stableIdAllocationProposals.length === 0, 'known source entities must not create allocation proposals');
  values(erp.catalog.trips).forEach((view) => {
    assert(view.recordType === 'schedule_offer' && view.isPhysicalServiceRun === false, `compatibility trip view is not labeled: ${view.id}`);
  });

  assert(values(erp.networkNodes).every((node) => /^node_\d{6}$/.test(node.nodeId)), 'network node IDs must be registry-issued');
  assert(values(erp.groupStops).every((stop) => /^gs_\d{6}$/.test(stop.groupStopId)), 'group stop IDs must be registry-issued');
  assert(values(erp.boardingPoints).every((point) => /^bp_\d{6}$/.test(point.boardingPointId)), 'boarding point IDs must be registry-issued');
  assert(Object.keys(erp.meta.stableIdRegistry.entries).length === 118, 'stable ID registry entry count mismatch');

  const corridor = values(erp.groupStops).sort((a, b) => a.corridorPosition - b.corridorPosition);
  assert(corridor.map((stop) => stop.groupStopCode).join('|') === EXPECTED_SEQUENCES.rsv_000002.join('|'), 'corridor order mismatch');
  assert(corridor[0].displayNameTh === 'ฉะเชิงเทรา', 'g01p001 label mismatch');
  assert(corridor[5].displayNameTh === 'ห้วยโสม', 'g01p006 label mismatch');
  assert(corridor[14].displayNameTh === 'คลองหาด', 'g01p015 label mismatch');

  const originDisabled = values(erp.destinations).filter((destination) => destination.phaseStatus === 'origin_disabled');
  assert(originDisabled.length === 34, 'must have 34 Phase 1 origin-disabled nodes');
  originDisabled.forEach((destination) => {
    assert(destination.originSelectable === false && destination.destinationSelectable === true, `capability mismatch: ${destination.destinationId}`);
    assert(!Object.prototype.hasOwnProperty.call(destination, 'phase1Role'), `permanent destination role remains: ${destination.destinationId}`);
    assert(erp.networkNodes[destination.nodeId], `network node missing: ${destination.destinationId}`);
    assert(!values(erp.boardingPoints).some((point) => point.nodeId === destination.nodeId), `fake boarding point created: ${destination.destinationId}`);
  });

  Object.keys(EXPECTED_SEQUENCES).forEach((sequenceId) => {
    const actual = erp.routeSequenceVersions[sequenceId].stops.map((stop) => stop.groupStopCode);
    assert(actual.join('|') === EXPECTED_SEQUENCES[sequenceId].join('|'), `sequence mismatch: ${sequenceId}`);
  });
  Object.keys(EXPECTED_TRIP_MAPPINGS).forEach((legacyPublishedTripId) => {
    const queueTrip = values(erp.fleet.queueTrips).find((trip) => trip.legacyPublishedTripId === legacyPublishedTripId);
    assert(queueTrip, `queue trip missing: ${legacyPublishedTripId}`);
    assert(queueTrip.routeSequenceVersionId === EXPECTED_TRIP_MAPPINGS[legacyPublishedTripId], `queue trip sequence mismatch: ${legacyPublishedTripId}`);
    assert(queueTrip.queueScheduleVersionId, `queue schedule version missing: ${legacyPublishedTripId}`);
    const assignment = values(erp.tripSequenceAssignments).find((item) => item.queueTripId === queueTrip.queueTripId);
    assert(assignment && assignment.routeSequenceVersionId === queueTrip.routeSequenceVersionId, `trip sequence assignment mismatch: ${legacyPublishedTripId}`);
  });

  values(erp.stopTimes).forEach((stopTime) => {
    assert(stopTime.queueTripId && erp.fleet.queueTrips[stopTime.queueTripId], `stop time queue trip missing: ${stopTime.stopTimeId}`);
    assert(!stopTime.tripId, `stop time must not reference schedule offer as physical trip: ${stopTime.stopTimeId}`);
    if (stopTime.timeType === 'scheduled_origin_departure') {
      assert(stopTime.primaryTimetableAuthority === true && stopTime.isEstimated === false, `origin authority mismatch: ${stopTime.stopTimeId}`);
      assert(stopTime.stopRole === 'scheduled_departure_point', `origin stop role mismatch: ${stopTime.stopTimeId}`);
    } else {
      assert(stopTime.isEstimated === true && stopTime.primaryTimetableAuthority === false, `estimated stop role mismatch: ${stopTime.stopTimeId}`);
      assert(stopTime.referenceOnly === true, `estimated stop must be reference-only: ${stopTime.stopTimeId}`);
      assert(stopTime.disclaimerKey === 'estimated_travel_time_may_change', `estimated stop disclaimer missing: ${stopTime.stopTimeId}`);
      assert(stopTime.guaranteedPickupTime === false && stopTime.exactOperationalProof === false, `estimated stop claims exact operation: ${stopTime.stopTimeId}`);
      if (stopTime.timeType === 'estimated_pass_through') {
        assert(stopTime.stopRole === 'pass_through_stop', `intermediate stop role mismatch: ${stopTime.stopTimeId}`);
        assert(stopTime.pickupOnDemand === true && stopTime.noWaitingStop === true, `intermediate pickup/no-wait policy mismatch: ${stopTime.stopTimeId}`);
      }
    }
  });
  assert(values(erp.groupStops).every((stop) => !stop.stopRole && stop.conditionalWaitingPoint !== true), 'group stop must not own global queue-trip role');
  assert(JSON.stringify(result.stopTimeRoleSummary) === JSON.stringify({ scheduled_origin_departure: 14, estimated_pass_through: 66, estimated_arrival: 14, unresolved: 0 }), 'stop-time role counts mismatch');
  const offerTimeSummary = result.validation.scheduleOfferTimeTypeSummary;
  assert(offerTimeSummary.mapped_queue_trip.scheduled_origin_departure === 66 && offerTimeSummary.mapped_queue_trip.estimated_pass_through === 287, 'mapped offer timeType summary mismatch');
  assert(offerTimeSummary.estimated_schedule.estimated_pass_through === 73, 'estimated offer timeType summary mismatch');
  assert(offerTimeSummary.departure_only.scheduled_origin_departure === 262, 'departure-only timeType summary mismatch');
  assert(offerTimeSummary.external_schedule.scheduled_origin_departure === 132, 'external timeType summary mismatch');
  const queue2 = values(erp.fleet.queueTrips).find((trip) => trip.legacyPublishedTripId === 'TRIP-ROUTE-MAIN-022-0800');
  const queue2Times = values(erp.stopTimes).filter((stopTime) => stopTime.queueTripId === queue2.queueTripId).sort((a, b) => a.sequence - b.sequence);
  assert(queue2Times.map((stopTime) => stopTime.groupStopCode).join('|') === EXPECTED_SEQUENCES.rsv_000003.join('|'), 'queue_002 order mismatch');
  assert(queue2Times.map((stopTime) => stopTime.departureTime).join('|') === '08:00|08:20|08:30|08:45|08:55|09:00|09:20|09:40|09:55|10:05|10:10|10:15|10:40|11:00|11:40', 'queue_002 chronology mismatch');

  const mergedQueueTrip = values(erp.fleet.queueTrips).find((trip) => trip.legacyPublishedTripId === 'TRIP-ROUTE-MAIN-021-1400');
  const mergedTimes = values(erp.stopTimes).filter((stopTime) => stopTime.queueTripId === mergedQueueTrip.queueTripId);
  ['km_1', 'km_7', 'huaisom', 'tatakiab'].forEach((stopKey) => assert(mergedTimes.some((stopTime) => stopTime.stopKey === stopKey), `singleton not merged: ${stopKey}`));
  assert(values(erp.fleet.queueTrips).every((trip) => trip.orderedStopTimes.length > 1), 'singleton active queue trip found');
  assert(values(erp.groupStops).every((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng)), 'source-proven group stop coordinates missing');
  assert(values(erp.stopTimes).filter((stopTime) => erp.fleet.queueTrips[stopTime.queueTripId].queueId === 'queue_005').length === 10, 'queue_005 stop-time count mismatch');
  assert(result.lineage.retainedEvidenceContainers.length === 26, 'lineage container count mismatch');

  const queue5Trips = values(erp.fleet.queueTrips).filter((trip) => trip.queueId === 'queue_005');
  queue5Trips.forEach((trip) => {
    assert(trip.assignmentMode === 'fixed' && trip.vehicleId === 'veh_005', `queue_005 assignment mismatch: ${trip.queueTripId}`);
    assert(trip.scheduleOnly === false && trip.liveTrackingAvailable === false, `queue_005 tracking policy mismatch: ${trip.queueTripId}`);
    assert(trip.serviceDays.length === 1 && trip.serviceDays[0] === 'daily', `queue_005 service days mismatch: ${trip.queueTripId}`);
  });
  const tatakiab1720Offer = erp.scheduleOffers['TRIP-ROUTE-MAIN-011-1720'];
  assert(tatakiab1720Offer, 'owner-approved Tatakiab 17:20 schedule offer missing');
  assert(tatakiab1720Offer.originDestinationId === 'chachoengsao' && tatakiab1720Offer.destinationId === 'tatakiab', 'Tatakiab 17:20 OD mismatch');
  assert(tatakiab1720Offer.departureTime === '17:20', 'Tatakiab 17:20 departure mismatch');
  assert(tatakiab1720Offer.mappingStatus === 'mapped_queue_trip' && tatakiab1720Offer.queueTripId === 'qt_000014', 'Tatakiab 17:20 must map to queue_005 evening trip');
  assert(tatakiab1720Offer.timeType === 'scheduled_origin_departure', 'Tatakiab 17:20 must display as origin scheduled departure');
  assert(tatakiab1720Offer.sourceLineage.some((lineage) => lineage.sourcePath === 'owner_decisions/queue_005/evening'), 'Tatakiab 17:20 owner lineage missing');

  const badOfferType = clone(erp);
  values(badOfferType.scheduleOffers)[0].recordType = 'physical_trip';
  values(badOfferType.scheduleOffers)[0].isPhysicalServiceRun = true;
  assertCustomBlock(badOfferType, 'schedule-offer-record-type-missing-or-invalid');
  assertCustomBlock(badOfferType, 'schedule-offer-interpreted-as-physical-run');

  const uniquelyUnmapped = clone(erp);
  const uniquelyMappedOffer = values(uniquelyUnmapped.scheduleOffers).find((offer) => offer.mappingStatus === 'mapped_queue_trip');
  uniquelyMappedOffer.mappingStatus = 'needs_review';
  uniquelyMappedOffer.mappingReasonCode = 'missing_stop_time';
  uniquelyMappedOffer.queueTripId = null;
  uniquelyMappedOffer.routeSequenceVersionId = null;
  assertCustomBlock(uniquelyUnmapped, 'uniquely-mappable-offer-unmapped');

  const estimatedMisclassified = clone(erp);
  values(estimatedMisclassified.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule').mappingStatus = 'departure_only';
  assertCustomBlock(estimatedMisclassified, 'owner-estimated-offer-misclassified');

  const invalidEstimatedStatus = clone(erp);
  values(invalidEstimatedStatus.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule').timeStatus = 'unknown';
  assertCustomBlock(invalidEstimatedStatus, 'estimated-schedule-time-status-invalid');

  const invalidEstimatedType = clone(erp);
  values(invalidEstimatedType.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule').timeType = null;
  assertCustomBlock(invalidEstimatedType, 'estimated-schedule-time-type-invalid');
  assertCustomBlock(invalidEstimatedType, 'estimated-schedule-time-type-unresolved');

  const passThroughSupported = clone(erp);
  const passThroughOffer = values(passThroughSupported.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule');
  passThroughOffer.timeType = 'estimated_pass_through';
  passThroughOffer.mappingEvidence.sourceOriginMatchesOfferOrigin = false;
  const passThroughValidation = validateReferences(passThroughSupported);
  assert(!passThroughValidation.blockers.some((blocker) => blocker.code === 'estimated-schedule-time-type-invalid'), 'estimated_pass_through must be supported');

  const missingDisclaimer = clone(erp);
  values(missingDisclaimer.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule').disclaimerKey = null;
  assertCustomBlock(missingDisclaimer, 'estimated-schedule-disclaimer-missing');

  const estimatedOperationalClaim = clone(erp);
  const estimatedOffer = values(estimatedOperationalClaim.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule');
  estimatedOffer.queueTripId = 'qt_000001';
  estimatedOffer.routeSequenceVersionId = 'rsv_000001';
  estimatedOffer.vehicleId = 'veh_001';
  estimatedOffer.liveTrackingAvailable = true;
  estimatedOffer.eta = '10:00';
  assertCustomBlock(estimatedOperationalClaim, 'estimated-schedule-operational-claim');

  const missingApproval = clone(erp);
  values(missingApproval.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule').approvalLineage = [];
  assertCustomBlock(missingApproval, 'estimated-schedule-owner-approval-lineage-missing');

  const missingReferenceOnly = clone(erp);
  delete values(missingReferenceOnly.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule').referenceOnly;
  assertCustomBlock(missingReferenceOnly, 'estimated-schedule-reference-only-required');

  const falseReferenceOnly = clone(erp);
  values(falseReferenceOnly.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule').referenceOnly = false;
  assertCustomBlock(falseReferenceOnly, 'estimated-schedule-reference-only-required');

  const nullReferenceOnly = clone(erp);
  values(nullReferenceOnly.scheduleOffers).find((offer) => offer.mappingStatus === 'estimated_schedule').referenceOnly = null;
  assertCustomBlock(nullReferenceOnly, 'estimated-schedule-reference-only-required');

  const wrongStopRole = clone(erp);
  values(wrongStopRole.stopTimes).find((stopTime) => stopTime.timeType === 'estimated_pass_through').timeType = 'scheduled_origin_departure';
  assertCustomBlock(wrongStopRole, 'stop-time-role-mismatch');

  const estimatedStopOperational = clone(erp);
  const estimatedStop = values(estimatedStopOperational.stopTimes).find((stopTime) => stopTime.timeType === 'estimated_pass_through');
  estimatedStop.guaranteedPickupTime = true;
  estimatedStop.eta = '10:00';
  assertCustomBlock(estimatedStopOperational, 'estimated-stop-time-operational-claim');

  const estimatedOfferNotReference = clone(erp);
  values(estimatedOfferNotReference.scheduleOffers).find((offer) => offer.mappingStatus === 'mapped_queue_trip' && offer.timeType === 'estimated_pass_through').referenceOnly = false;
  assertCustomBlock(estimatedOfferNotReference, 'estimated-offer-reference-only-required');

  const invalidPassThroughPolicy = clone(erp);
  const invalidPassThrough = values(invalidPassThroughPolicy.stopTimes).find((stopTime) => stopTime.stopRole === 'pass_through_stop');
  invalidPassThrough.pickupOnDemand = false;
  invalidPassThrough.noWaitingStop = false;
  assertCustomBlock(invalidPassThroughPolicy, 'pass-through-stop-policy-invalid');

  const unapprovedConditionalWaiting = clone(erp);
  const unapprovedStop = values(unapprovedConditionalWaiting.stopTimes).find((stopTime) => stopTime.stopRole === 'pass_through_stop');
  unapprovedStop.conditionalWaitingPoint = true;
  unapprovedStop.stopBehaviors.push('conditional_waiting_point');
  assertCustomBlock(unapprovedConditionalWaiting, 'conditional-waiting-point-unapproved');

  const approvedConditionalWaiting = clone(erp);
  const approvedStop = values(approvedConditionalWaiting.stopTimes).find((stopTime) => stopTime.stopRole === 'pass_through_stop');
  approvedStop.conditionalWaitingPoint = true;
  approvedStop.conditionalWaitingApproval = { source: 'owner_decision', scope: approvedStop.queueTripId };
  approvedStop.noWaitingStop = false;
  approvedStop.stopBehaviors = approvedStop.stopBehaviors.filter((behavior) => behavior !== 'no_waiting_stop');
  approvedStop.stopBehaviors.push('conditional_waiting_point');
  const approvedQueueTrip = approvedConditionalWaiting.fleet.queueTrips[approvedStop.queueTripId];
  const approvedOrderedStop = approvedQueueTrip.orderedStopTimes.find((stop) => stop.groupStopId === approvedStop.groupStopId);
  approvedOrderedStop.conditionalWaitingPoint = true;
  approvedOrderedStop.conditionalWaitingApproval = approvedStop.conditionalWaitingApproval;
  approvedOrderedStop.noWaitingStop = false;
  approvedOrderedStop.stopBehaviors = approvedOrderedStop.stopBehaviors.filter((behavior) => behavior !== 'no_waiting_stop');
  approvedOrderedStop.stopBehaviors.push('conditional_waiting_point');
  const approvedConditionalValidation = validateReferences(approvedConditionalWaiting);
  assert(!approvedConditionalValidation.blockers.some((blocker) => blocker.code === 'conditional-waiting-point-unapproved' || blocker.code === 'queue-trip-conditional-waiting-unapproved'), 'owner-approved queueTrip conditional waiting point must be supported');

  const globalWaitingRole = clone(erp);
  values(globalWaitingRole.groupStops)[0].conditionalWaitingPoint = true;
  assertCustomBlock(globalWaitingRole, 'global-group-stop-operational-role-forbidden');

  const unmappedPhysical = clone(erp);
  const departureOnly = values(unmappedPhysical.scheduleOffers).find((offer) => offer.mappingStatus === 'departure_only');
  departureOnly.queueTripId = 'qt_000001';
  departureOnly.routeSequenceVersionId = 'rsv_000001';
  assertCustomBlock(unmappedPhysical, 'unmapped-schedule-offer-has-physical-fields');

  const sequenceGap = clone(erp);
  sequenceGap.routeSequenceVersions.rsv_000001.stops[1].sequence = 3;
  assertCustomBlock(sequenceGap, 'route-sequence-gap-or-duplicate');

  const invalidQueue5 = clone(erp);
  const invalidQueue5Trip = values(invalidQueue5.fleet.queueTrips).find((trip) => trip.queueId === 'queue_005');
  invalidQueue5Trip.scheduleOnly = true;
  invalidQueue5Trip.assignmentMode = 'rotation';
  invalidQueue5Trip.vehicleId = 'veh_001';
  assertCustomBlock(invalidQueue5, 'queue-005-schedule-only');
  assertCustomBlock(invalidQueue5, 'queue-005-invalid-assignment');

  const applyReady = clone(erp);
  applyReady.settings.readyForApply = true;
  assertCustomBlock(applyReady, 'ready-for-apply-not-false');
  const fakeEta = clone(erp);
  fakeEta.fleet.vehicles.veh_005.eta = '19:05';
  assertCustomBlock(fakeEta, 'fake-gps-or-eta-field');

  const writesEnabled = globalThis.SLTransit.importPlan.validateImportPlan({ dryRun: true, writesEnabled: true, data: { erpDataCenter: {} } });
  assert(writesEnabled.blockers.some((blocker) => blocker.code === 'writes-enabled-not-false'), 'writesEnabled=true must be blocked');
  const runtimeSeed = globalThis.SLTransit.importPlan.validateImportPlan({ dryRun: true, writesEnabled: false, data: { erpDataCenter: { operations: { dailyAssignments: { fake: true } } } } });
  assert(runtimeSeed.blockers.some((blocker) => blocker.code === 'forbidden-erp-operations-subtree'), 'runtime seed path must be blocked');

  assert(!erp.routes['ROUTE-MAIN-211'] && !erp.routes['ROUTE-MAIN-221'], 'review-only routes became active');
  assert(Object.keys(erp.terminals).length === 0 && Object.keys(erp.providers).length === 0, 'fake terminal/provider data created');
  assert(Object.keys(erp.fleet.drivers).length === 0 && Object.keys(erp.fleet.vehicleLoginIndex).length === 0, 'private fleet identity data created');
  assert(!/(เธ|เน€|เน|�)/.test(JSON.stringify(result)), 'mojibake detected');
  assert(!/"(?:latitude|longitude|eta|gpsPosition)"\s*:/.test(JSON.stringify(erp)), 'fake GPS/ETA field detected');

  console.log('erp-data-center dry-run snapshot ok');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
