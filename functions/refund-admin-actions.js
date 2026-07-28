"use strict";

const crypto = require("crypto");

const CONTRACT_VERSION = "refund_admin_v1";
const AUDIT_PATH = "operations/refundAudit";
const REFUND_REF_PATH = "operations/refundReferences";

const TRANSITIONS = {
  none: new Set(["requested"]),
  requested: new Set(["under_review", "rejected"]),
  under_review: new Set(["approved", "rejected"]),
  approved: new Set(["processing", "rejected"]),
  processing: new Set(["refunded", "failed"]),
  refunded: new Set([]),
  rejected: new Set([]),
  failed: new Set(["processing", "rejected"])
};

function nowValue(admin) {
  return admin.database.ServerValue.TIMESTAMP;
}

function hashBookingId(id) {
  return crypto.createHash("sha256").update(String(id || "")).digest("hex");
}

function cleanStatus(value) {
  return String(value || "none").trim() || "none";
}

function paidAmount(booking) {
  const values = [booking && booking.paidAmount, booking && booking.price, booking && booking.total, booking && booking.totalAmount];
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function eligibleAmount(booking) {
  const n = Number(booking && booking.refundEligibleAmount);
  return Number.isFinite(n) && n >= 0 ? n : paidAmount(booking);
}

function validateAmount(booking, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw Object.assign(new Error("invalid_refund_amount"), { httpStatus: 400 });
  if (value > paidAmount(booking)) throw Object.assign(new Error("refund_amount_exceeds_paid"), { httpStatus: 400 });
  if (value > eligibleAmount(booking)) throw Object.assign(new Error("refund_amount_exceeds_eligible"), { httpStatus: 400 });
  return value;
}

function bookingOwnerUid(booking) {
  const candidates = [
    booking && booking.passengerUid,
    booking && booking.firebaseUid,
    booking && booking.userUid,
    booking && booking.passengerIdentity && booking.passengerIdentity.firebaseUid,
    booking && booking.passengerIdentity && booking.passengerIdentity.uid
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function isAdminActor(actor) {
  return actor && (actor.role === "owner" || actor.role === "admin");
}

function assertPassengerCanRequestRefund(booking, actor) {
  if (isAdminActor(actor)) return;
  const ownerUid = bookingOwnerUid(booking);
  if (!ownerUid || ownerUid !== String(actor && actor.uid || "")) {
    throw Object.assign(new Error("booking_ownership_unverified"), { httpStatus: 403 });
  }
}

function assertTransition(from, to) {
  const allowed = TRANSITIONS[cleanStatus(from)] || TRANSITIONS.none;
  if (!allowed.has(to)) {
    throw Object.assign(new Error("invalid_refund_state_transition"), { httpStatus: 409 });
  }
}

function auditEvent(action, bookingId, previousStatus, newStatus, amount, actor, idempotencyKey, result) {
  const eventId = crypto.createHash("sha256")
    .update([bookingId, action, idempotencyKey || "", newStatus || "", amount || 0].join("|"))
    .digest("hex");
  return {
    eventId,
    bookingIdHash: hashBookingId(bookingId),
    refundId: "refund_" + hashBookingId(bookingId).slice(0, 20),
    action,
    previousStatus,
    newStatus,
    amount: amount == null ? null : amount,
    actorUid: actor && actor.uid || "",
    actorRole: actor && actor.role || "",
    serverTimestamp: null,
    idempotencyKey: idempotencyKey || "",
    result
  };
}

function publicBookingPatch(action, nextStatus, actor, body, admin, booking) {
  const amount = body.refundAmount != null ? validateAmount(booking, body.refundAmount) : null;
  const patch = {
    refundStatus: nextStatus,
    refundUpdatedByUid: actor && actor.uid || "",
    refundUpdatedByRole: actor && actor.role || "",
    refundContractVersion: CONTRACT_VERSION
  };
  if (amount != null) patch.refundAmount = amount;
  if (body.refundReasonCode) patch.refundReasonCode = String(body.refundReasonCode).slice(0, 80);
  if (body.refundMethod) patch.refundMethod = String(body.refundMethod).slice(0, 80);
  if (action === "requestRefund") patch.refundRequestedAt = nowValue(admin);
  if (action === "reviewRefund") patch.refundReviewedAt = nowValue(admin);
  if (action === "approveRefund") patch.refundApprovedAt = nowValue(admin);
  if (action === "completeRefund") {
    patch.refundedAt = nowValue(admin);
    patch.refundReference = String(body.refundReference || "").trim();
  }
  return patch;
}

async function runRefundAction(params) {
  const admin = params.admin;
  const db = admin.database();
  const bookingId = String(params.bookingId || "").trim();
  const action = params.action;
  const nextStatus = params.nextStatus;
  const actor = params.actor || {};
  const body = params.body || {};
  const idempotencyKey = String(params.idempotencyKey || body.idempotencyKey || "").trim();
  if (!bookingId || !/^[A-Z0-9][A-Z0-9_-]{5,}$/i.test(bookingId)) throw Object.assign(new Error("invalid_booking_id"), { httpStatus: 400 });
  if (!idempotencyKey) throw Object.assign(new Error("idempotency_key_required"), { httpStatus: 400 });

  const bookingRef = db.ref(`bookings/${bookingId}`);
  const idemRef = db.ref(`operations/refundIdempotency/${idempotencyKey}`);
  const idem = await idemRef.transaction((current) => current || { bookingId, action, lockedAt: nowValue(admin) });
  const idemVal = idem.snapshot && idem.snapshot.val && idem.snapshot.val();
  if (!idem.committed && idemVal && idemVal.result === "success") return { status: "ok", idempotent: true, result: idemVal };
  if (!idem.committed && idemVal && (idemVal.bookingId !== bookingId || idemVal.action !== action)) throw Object.assign(new Error("idempotency_key_conflict"), { httpStatus: 409 });

  const snap = await bookingRef.get();
  const booking = snap.val() || {};
  if (action === "requestRefund") assertPassengerCanRequestRefund(booking, actor);
  const previousStatus = cleanStatus(booking.refundStatus);
  if (action === "completeRefund" && previousStatus === "refunded") {
    await idemRef.update({ result: "success", idempotent: true, completedAt: nowValue(admin) });
    return { status: "ok", idempotent: true, refundStatus: "refunded" };
  }
  assertTransition(previousStatus, nextStatus);
  if (action === "completeRefund" && !String(body.refundReference || "").trim()) {
    throw Object.assign(new Error("refund_reference_required"), { httpStatus: 400 });
  }
  if (action === "completeRefund") {
    const reference = String(body.refundReference).trim();
    const refResult = await db.ref(`${REFUND_REF_PATH}/${reference}`).transaction((current) => current || { bookingId, idempotencyKey, createdAt: nowValue(admin) });
    const refVal = refResult.snapshot && refResult.snapshot.val && refResult.snapshot.val();
    if (!refResult.committed && refVal && refVal.bookingId !== bookingId) throw Object.assign(new Error("refund_reference_conflict"), { httpStatus: 409 });
  }

  const patch = publicBookingPatch(action, nextStatus, actor, body, admin, booking);
  await bookingRef.update(patch);
  const amount = patch.refundAmount == null ? Number(booking.refundAmount || 0) : patch.refundAmount;
  const audit = auditEvent(action, bookingId, previousStatus, nextStatus, amount, actor, idempotencyKey, "success");
  audit.serverTimestamp = nowValue(admin);
  await db.ref(`${AUDIT_PATH}/${audit.eventId}`).set(audit);
  await idemRef.update({ result: "success", refundStatus: nextStatus, completedAt: nowValue(admin) });
  return { status: "ok", refundStatus: nextStatus, auditEventId: audit.eventId };
}

module.exports = {
  CONTRACT_VERSION,
  TRANSITIONS,
  hashBookingId,
  bookingOwnerUid,
  validateAmount,
  auditEvent,
  runRefundAction
};
