'use strict';

const assert = require('node:assert/strict');
const { buildCheckTicketPreviewContract } = require('../tools/erp-logic-center-dry-run.js');

const previewMeta = {
  schemaVersion: 'publishedSchedule.v1.preview',
  sourceCommitSha: '31ace5fa559706668e5ff0814ef8f5a511be78e9',
  publicationStatus: 'preview',
  dryRun: true,
  writesEnabled: false,
  readyForApply: false,
  productionReady: false
};

const schedulePair = {
  compatibilityPairKey: 'สนามชัยเขต__พัทยา',
  pairId: 'pair_preview_001',
  canonicalPairKey: 'node_003__node_201',
  originLabel: 'สนามชัยเขต',
  destinationLabel: 'พัทยา',
  displayBadgeTh: 'ข้อมูลต่อรถอ้างอิง',
  transferDisclaimerTh: 'ข้อมูลต่อรถเป็นข้อมูลอ้างอิง กรุณาตรวจสอบรอบจริงอีกครั้ง',
  transfer: {
    required: true,
    status: 'feasible',
    transferNodeLabel: 'ฉะเชิงเทรา'
  },
  segments: [{
    fromLabel: 'สนามชัยเขต',
    toLabel: 'ฉะเชิงเทรา',
    displayBadgeTh: 'เวลาโดยประมาณ',
    times: [{
      time: '09:00',
      displayBadgeTh: 'เวลาโดยประมาณ',
      disclaimerTh: 'เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง'
    }]
  }]
};

const selectedTrip = {
  pickupTime: '09:00',
  pairKey: schedulePair.compatibilityPairKey,
  pairId: schedulePair.pairId,
  canonicalPairKey: schedulePair.canonicalPairKey,
  sourcePair: schedulePair,
  sourceSegment: schedulePair.segments[0],
  sourceTime: schedulePair.segments[0].times[0],
  segmentIndex: 0,
  timeIndex: 0,
  scheduleOnly: true,
  referenceOnly: true
};

const bookingSnapshot = {
  bookingCode: 'PREVIEW-BOOKING-001',
  publishedSchedule: {
    schemaVersion: previewMeta.schemaVersion,
    sourceCommitSha: previewMeta.sourceCommitSha,
    readyForApply: false,
    publicationStatus: 'preview'
  },
  name: 'ผู้โดยสารตัวอย่าง',
  phone: '0000000000',
  pax: 1,
  originStopKey: 'sanamchaikhet',
  destStopKey: 'pattaya',
  pickupTime: '09:00',
  serviceDate: '2026-07-16',
  pairKey: schedulePair.compatibilityPairKey,
  pairId: schedulePair.pairId,
  canonicalPairKey: schedulePair.canonicalPairKey,
  fareAmount: 85,
  fareContract: { status: 'ready', fareAmount: 85, paymentOwnership: 'sl_transit' },
  paymentOwnership: 'sl_transit',
  externalPaymentRequired: false,
  referenceOnly: true,
  status: 'awaiting_payment',
  assignment: {
    assignmentSource: 'none',
    scheduleOnly: true,
    liveTrackingAvailable: false
  }
};

const ready = buildCheckTicketPreviewContract({
  previewMeta,
  bookingSnapshot,
  schedulePair,
  selectedTrip,
  transferContext: { arrivalTime: '10:00', departureTime: '10:30' },
  etaContext: {
    now: new Date('2026-07-16T08:00:00').getTime(),
    scheduleEstimate: { referenceOnly: true, time: '09:00' }
  },
  journeyStatus: { status: 'preview_only', reason: 'no_operational_ticket' }
});

assert.equal(ready.contractVersion, 'check_ticket_preview_v1');
assert.equal(ready.mode, 'preview');
assert.equal(ready.source.publishedSchedulePath, 'preview/publishedSchedule');
assert.equal(ready.validation.readyForReview, true);
assert.equal(ready.validation.readyForDisplay, true);
assert.deepEqual(ready.validation.blockers, []);
assert.equal(ready.safety.writesEnabled, false);
assert.equal(ready.safety.readyForApply, false);
assert.equal(ready.safety.targetPath, null);
assert.equal(ready.actions.createTicket, false);
assert.equal(ready.actions.updateTicket, false);
assert.equal(ready.actions.checkIn, false);
assert.equal(ready.actions.sendNotification, false);
assert.equal(ready.journey.routeText, 'สนามชัยเขต → พัทยา');
assert.equal(ready.journey.transferRequired, true);
assert.equal(ready.journey.pickupTimeText, '09:00 น.');
assert.deepEqual(ready.journey.disclaimers, [
  'ข้อมูลต่อรถเป็นข้อมูลอ้างอิง กรุณาตรวจสอบรอบจริงอีกครั้ง',
  'เวลาประมาณการ อาจเปลี่ยนแปลงตามสภาพการเดินทาง'
]);
assert.equal(ready.fare.amount, 85);
assert.equal(ready.fare.displayText, '85 บาท');
assert.equal(ready.assignment.scheduleOnly, true);
assert.equal(ready.assignment.vehicleId, '');
assert.equal(ready.decisions.checkinEligibility.allowed, false);
assert.equal(ready.decisions.transferFeasibility.status, 'feasible');
assert.equal(ready.decisions.etaSource.source, 'schedule_estimate');
assert.equal(ready.decisions.etaSource.status, 'reference_only');
assert.equal(ready.decisions.journeyStatus.status, 'preview_only');

const missingDependency = buildCheckTicketPreviewContract({ previewMeta });
assert.equal(missingDependency.validation.readyForDisplay, false);
assert(missingDependency.validation.blockers.includes('missing_booking_snapshot'));
assert(missingDependency.validation.blockers.includes('missing_published_schedule_pair'));
assert(missingDependency.validation.blockers.includes('missing_selected_trip'));
assert.equal(missingDependency.actions.createTicket, false);

const unsafePreview = buildCheckTicketPreviewContract({
  previewMeta: Object.assign({}, previewMeta, {
    writesEnabled: true,
    readyForApply: true,
    productionReady: true,
    publicationStatus: 'production'
  }),
  bookingSnapshot,
  schedulePair,
  selectedTrip
});
assert.equal(unsafePreview.validation.readyForDisplay, false);
assert(unsafePreview.validation.blockers.includes('preview_writes_not_disabled'));
assert(unsafePreview.validation.blockers.includes('preview_apply_gate_not_closed'));
assert(unsafePreview.validation.blockers.includes('preview_production_gate_not_closed'));
assert(unsafePreview.validation.blockers.includes('preview_publication_status_invalid'));
assert.equal(unsafePreview.safety.writesEnabled, false, 'contract output must remain no-write even for unsafe input');

const incompleteLiveAssignment = buildCheckTicketPreviewContract({
  previewMeta,
  bookingSnapshot: Object.assign({}, bookingSnapshot, {
    assignment: {
      assignmentSource: 'daily_assignment',
      scheduleOnly: false,
      liveTrackingAvailable: true
    }
  }),
  schedulePair,
  selectedTrip
});
assert.equal(incompleteLiveAssignment.validation.readyForDisplay, false);
assert(incompleteLiveAssignment.validation.blockers.includes('missing_assignment_id'));
assert(incompleteLiveAssignment.validation.blockers.includes('missing_assignment_queue_id'));
assert(incompleteLiveAssignment.validation.blockers.includes('missing_assignment_vehicle_id'));

const missingAssignmentSource = buildCheckTicketPreviewContract({
  previewMeta,
  bookingSnapshot: Object.assign({}, bookingSnapshot, {
    assignment: {
      scheduleOnly: true,
      liveTrackingAvailable: false
    }
  }),
  schedulePair,
  selectedTrip
});
assert.equal(missingAssignmentSource.validation.readyForDisplay, false);
assert(missingAssignmentSource.validation.blockers.includes('missing_assignment_source'));

const externalBooking = Object.assign({}, bookingSnapshot, {
  bookingCode: 'PREVIEW-EXTERNAL-001',
  fareAmount: 0,
  fareContract: null,
  paymentOwnership: 'external_pay',
  externalPaymentRequired: true
});
const external = buildCheckTicketPreviewContract({
  previewMeta,
  bookingSnapshot: externalBooking,
  schedulePair,
  selectedTrip
});
assert.equal(external.validation.readyForDisplay, true);
assert.equal(external.fare.amount, 0);
assert.equal(external.fare.displayText, 'ชำระภายนอกระบบ');

console.log('erp-logic-center check-ticket preview contract ok');
