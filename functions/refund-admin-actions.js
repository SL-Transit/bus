"use strict";

const crypto = require("crypto");

const CONTRACT_VERSION = "refund_admin_v2";
const AUDIT_PATH = "operations/refundAudit";
const REFUND_PATH = "operations/refunds";
const REFUND_REF_PATH = "operations/refundReferences";
const IDEMPOTENCY_PATH = "operations/refundIdempotency";

const TRANSITIONS = {
  none: new Set(["requested"]),
  requested: new Set(["under_review", "rejected"]),
  under_review: new Set(["approved", "rejected"]),
  approved: new Set(["processing", "rejected"]),
  processing: new Set(["refunded"]),
  refunded: new Set([]),
  rejected: new Set([])
};

function nowValue(admin) {
  return admin.database.ServerValue.TIMESTAMP;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function hashBookingId(id) {
  return sha256(id);
}

function cleanStatus(value) {
  return String(value || "none").trim() || "none";
}

function safeKeyHash(value, name) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 160) throw Object.assign(new Error(`${name}_invalid`), { httpStatus: 400 });
  return sha256(raw);
}

function paidAmount(booking) {
  if (String(booking && booking.paymentStatus || "").toLowerCase() !== "paid") {
    throw Object.assign(new Error("missing_paid_amount_contract"), { httpStatus: 409 });
  }
  if (!Number.isFinite(Number(booking && booking.paidAt)) || Number(booking.paidAt) <= 0) {
    throw Object.assign(new Error("missing_paid_amount_contract"), { httpStatus: 409 });
  }
  if (booking && booking.paymentOwnership !== "sl_transit") {
    throw Object.assign(new Error("missing_paid_amount_contract"), { httpStatus: 409 });
  }
  if (booking && booking.externalPaymentRequired === true) {
    throw Object.assign(new Error("missing_paid_amount_contract"), { httpStatus: 409 });
  }
  const amount = Number(booking && booking.paidAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error("missing_paid_amount_contract"), { httpStatus: 409 });
  }
  return amount;
}

function eligibleAmount(booking) {
  const amount = Number(booking && booking.refundEligibleAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Object.assign(new Error("missing_refund_eligibility_contract"), { httpStatus: 409 });
  }
  return amount;
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

function refundId(bookingId) {
  return "refund_" + hashBookingId(bookingId).slice(0, 32);
}

function auditEvent(action, bookingId, previousStatus, newStatus, amount, actor, idempotencyKeyHash, result) {
  const eventId = sha256([bookingId, action, idempotencyKeyHash || "", newStatus || "", amount || 0].join("|"));
  return {
    eventId,
    bookingIdHash: hashBookingId(bookingId),
    refundId: refundId(bookingId),
    action,
    previousStatus,
    newStatus,
    amount: amount == null ? null : amount,
    actorUid: actor && actor.uid || "",
    actorRole: actor && actor.role || "",
    serverTimestamp: null,
    idempotencyKeyHash: idempotencyKeyHash || "",
    result
  };
}

function publicMirrorPatch(action, nextStatus, body, admin, booking) {
  const patch = {
    refundStatus: nextStatus,
    refundContractVersion: CONTRACT_VERSION
  };
  if (body.refundAmount != null) patch.refundAmount = validateAmount(booking, body.refundAmount);
  if (action === "requestRefund") patch.refundRequestedAt = nowValue(admin);
  if (action === "approveRefund") patch.refundApprovedAt = nowValue(admin);
  if (action === "completeRefund") patch.refundedAt = nowValue(admin);
  return patch;
}

function privateOperationPatch(action, nextStatus, body, admin, booking, actor, idempotencyKeyHash, referenceHash) {
  const amount = body.refundAmount != null ? validateAmount(booking, body.refundAmount) : Number(booking.refundAmount || 0);
  if ((action === "approveRefund" || action === "completeRefund") && (!Number.isFinite(amount) || amount <= 0)) {
    throw Object.assign(new Error("invalid_refund_amount"), { httpStatus: 400 });
  }
  if (action === "approveRefund" || action === "completeRefund") validateAmount(booking, amount);
  const patch = {
    refundStatus: nextStatus,
    refundAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
    refundEligibleAmount: eligibleAmount(booking),
    refundUpdatedByUid: actor && actor.uid || "",
    refundUpdatedByRole: actor && actor.role || "",
    refundContractVersion: CONTRACT_VERSION,
    idempotencyKeyHash
  };
  if (body.refundReasonCode) patch.refundReasonCode = String(body.refundReasonCode).slice(0, 80);
  if (body.refundMethod) patch.refundMethod = String(body.refundMethod).slice(0, 80);
  if (action === "requestRefund") patch.refundRequestedAt = nowValue(admin);
  if (action === "reviewRefund") patch.refundReviewedAt = nowValue(admin);
  if (action === "approveRefund") patch.refundApprovedAt = nowValue(admin);
  if (action === "startRefundProcessing") patch.refundProcessingStartedAt = nowValue(admin);
  if (action === "completeRefund") {
    patch.refundedAt = nowValue(admin);
    patch.refundReferenceHash = referenceHash;
  }
  return patch;
}

async function lockIdempotency(db, admin, idempotencyKeyHash, bookingId, action) {
  const ref = db.ref(`${IDEMPOTENCY_PATH}/${idempotencyKeyHash}`);
  let conflict = null;
  const tx = await ref.transaction((current) => {
    if (current) {
      conflict = current;
      return undefined;
    }
    return { status: "locked", bookingIdHash: hashBookingId(bookingId), action, lockedAt: nowValue(admin) };
  });
  if (!tx.committed) {
    if (conflict && conflict.status === "success") return { duplicate: true, marker: conflict };
    throw Object.assign(new Error("idempotency_key_conflict"), { httpStatus: 409 });
  }
  return { duplicate: false, ref };
}

async function runRefundAction(params) {
  const admin = params.admin;
  const db = admin.database();
  const bookingId = String(params.bookingId || "").trim();
  const action = params.action;
  const nextStatus = params.nextStatus;
  const actor = params.actor || {};
  const body = params.body || {};
  if (!bookingId || !/^[A-Z0-9][A-Z0-9_-]{5,}$/i.test(bookingId)) throw Object.assign(new Error("invalid_booking_id"), { httpStatus: 400 });
  const idempotencyKeyHash = safeKeyHash(params.idempotencyKey || body.idempotencyKey, "idempotency_key");
  const idem = await lockIdempotency(db, admin, idempotencyKeyHash, bookingId, action);
  if (idem.duplicate) return { status: "ok", idempotent: true, result: idem.marker };

  try {
    const bookingRef = db.ref(`bookings/${bookingId}`);
    const refundRef = db.ref(`${REFUND_PATH}/${refundId(bookingId)}`);
    const snap = await bookingRef.get();
    const booking = snap.val() || {};
    if (!booking || !booking.code) throw Object.assign(new Error("booking_not_found"), { httpStatus: 404 });
    if (action === "completeRefund" && cleanStatus(booking.refundStatus) === "refunded" && booking.refundedAt) {
      await idem.ref.update({ status: "success", idempotent: true, refundStatus: "refunded", completedAt: nowValue(admin) });
      return { status: "ok", idempotent: true, refundStatus: "refunded" };
    }
    if (action === "requestRefund") assertPassengerCanRequestRefund(booking, actor);
    if (action === "completeRefund" && !String(body.refundReference || "").trim()) {
      throw Object.assign(new Error("refund_reference_required"), { httpStatus: 400 });
    }
    if (action === "approveRefund" || action === "completeRefund") {
      const amount = body.refundAmount != null ? body.refundAmount : booking.refundAmount;
      validateAmount(booking, amount);
    }
    let previousStatus = "none";
    let privatePatch = null;
    let mirrorPatch = null;
    let referenceHash = null;

    const tx = await refundRef.transaction((current) => {
      const op = current || { bookingIdHash: hashBookingId(bookingId), refundId: refundId(bookingId), refundStatus: cleanStatus(booking.refundStatus) };
      previousStatus = cleanStatus(op.refundStatus);
      assertTransition(previousStatus, nextStatus);
      return Object.assign({}, op, { refundStatus: nextStatus, updatedAt: nowValue(admin) });
    });
    if (!tx.committed) throw Object.assign(new Error("refund_transition_conflict"), { httpStatus: 409 });
    if (action === "completeRefund") {
      referenceHash = safeKeyHash(body.refundReference, "refund_reference");
      const refResult = await db.ref(`${REFUND_REF_PATH}/${referenceHash}`).transaction((current) => {
        if (current && current.bookingIdHash !== hashBookingId(bookingId)) return undefined;
        return current || { bookingIdHash: hashBookingId(bookingId), idempotencyKeyHash, createdAt: nowValue(admin) };
      });
      if (!refResult.committed) throw Object.assign(new Error("refund_reference_conflict"), { httpStatus: 409 });
    }
    privatePatch = privateOperationPatch(action, nextStatus, body, admin, booking, actor, idempotencyKeyHash, referenceHash);
    mirrorPatch = publicMirrorPatch(action, nextStatus, body, admin, booking);
    await refundRef.update(privatePatch);
    await bookingRef.update(mirrorPatch);
    const amount = privatePatch.refundAmount == null ? null : privatePatch.refundAmount;
    const audit = auditEvent(action, bookingId, previousStatus, nextStatus, amount, actor, idempotencyKeyHash, "success");
    audit.serverTimestamp = nowValue(admin);
    await db.ref(`${AUDIT_PATH}/${audit.eventId}`).set(audit);
    await idem.ref.update({ status: "success", refundStatus: nextStatus, completedAt: nowValue(admin) });
    return { status: "ok", refundStatus: nextStatus, auditEventId: audit.eventId };
  } catch (err) {
    if (idem && idem.ref) {
      await idem.ref.update({ status: err && err.httpStatus && err.httpStatus < 500 ? "failed_final" : "failed_retriable", completedAt: nowValue(admin) });
    }
    throw err;
  }
}

module.exports = {
  CONTRACT_VERSION,
  TRANSITIONS,
  hashBookingId,
  bookingOwnerUid,
  safeKeyHash,
  paidAmount,
  eligibleAmount,
  validateAmount,
  auditEvent,
  runRefundAction
};
