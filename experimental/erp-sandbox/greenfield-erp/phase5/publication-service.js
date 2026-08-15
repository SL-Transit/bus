"use strict";

const crypto = require("node:crypto");
const { estimateChunks } = require("../../contracts/greenfield-erp/v1/runtime/validate-network-package.js");
const { buildPublishedRecords, canonicalJson, checksum, safeSegment } = require("./read-model-builder.js");

const OPERATIONAL_CHUNK_BYTES = 4 * 1024 * 1024;
const OPERATIONAL_CHUNK_PATHS = 4500;

function codedError(code, details) {
  const error = new Error(code);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function requireStore(store) {
  [
    "beginVersion", "writeChunk", "verifyChunk", "finalizeVersion",
    "failVersion", "getManifest", "atomicSwitch"
  ].forEach(function (method) {
    if (!store || typeof store[method] !== "function") throw codedError("publication_store_required", method);
  });
}

function assertApproval(approval) {
  if (!approval || approval.status !== "approved" || typeof approval.approvalId !== "string" || !approval.approvalId) {
    throw codedError("publication_approval_required");
  }
}

function chunkDescriptors(records, limits) {
  const chunks = estimateChunks(records, {
    maxBytes: limits.maxBytes,
    maxPaths: limits.maxPaths
  });
  return chunks.map(function (chunk, index) {
    const chunkId = "CHK-" + String(index + 1).padStart(6, "0");
    const digestInput = chunk.records.map(function (record) { return { path: record.path, value: record.value }; });
    return {
      chunkId,
      bytes: Buffer.byteLength(canonicalJson(digestInput), "utf8"),
      leafPaths: chunk.paths,
      recordCount: chunk.records.length,
      checksum: checksum(digestInput),
      records: chunk.records
    };
  });
}

function createPublicationService(options) {
  const input = options || {};
  const store = input.store;
  requireStore(store);
  const now = typeof input.now === "function" ? input.now : function () { return new Date().toISOString(); };
  const limits = {
    maxBytes: input.maxChunkBytes || OPERATIONAL_CHUNK_BYTES,
    maxPaths: input.maxChunkPaths || OPERATIONAL_CHUNK_PATHS
  };
  if (limits.maxBytes > OPERATIONAL_CHUNK_BYTES || limits.maxPaths > OPERATIONAL_CHUNK_PATHS) {
    throw codedError("publication_operational_limit_exceeded");
  }

  async function stage(request) {
    const command = request || {};
    safeSegment(command.versionId, "versionId");
    safeSegment(command.draftId, "draftId");
    if (typeof command.actorUid !== "string" || !command.actorUid) throw codedError("publication_actor_required");
    assertApproval(command.approval);

    const built = buildPublishedRecords({
      package: command.package,
      serviceDates: command.serviceDates,
      routingSupplements: command.routingSupplements
    });
    const chunks = chunkDescriptors(built.records, limits);
    const chunkManifest = {};
    chunks.forEach(function (chunk) {
      chunkManifest[chunk.chunkId] = {
        bytes: chunk.bytes,
        leafPaths: chunk.leafPaths,
        recordCount: chunk.recordCount,
        checksum: chunk.checksum
      };
    });

    const requestHash = checksum({
      versionId: command.versionId,
      draftId: command.draftId,
      approvalId: command.approval.approvalId,
      sourcePackageId: built.sourcePackageId,
      modelHash: built.modelHash,
      serviceDates: built.serviceDates
    });
    const createdAt = now();
    const manifestCore = {
      versionId: command.versionId,
      schemaVersion: built.schemaVersion,
      sourceSchemaVersion: built.sourceSchemaVersion,
      sourcePackageId: built.sourcePackageId,
      sourceDraftId: command.draftId,
      approvalId: command.approval.approvalId,
      requestHash,
      createdAt,
      createdByUid: command.actorUid,
      serviceDates: built.serviceDates,
      nodeCounts: built.nodeCounts,
      recordCount: built.recordCount,
      leafPathCount: built.leafPathCount,
      chunkCount: chunks.length,
      chunks: chunkManifest,
      modelHash: built.modelHash
    };
    const manifestHash = checksum(manifestCore);
    const buildingManifest = Object.freeze({
      ...manifestCore,
      manifestHash,
      status: "building"
    });

    let began = false;
    try {
      const begin = await store.beginVersion(buildingManifest);
      began = true;
      if (begin.manifest && begin.manifest.status === "ready") {
        if (begin.manifest.requestHash !== requestHash) throw codedError("publication_version_conflict");
        return { ok: true, reused: true, versionId: command.versionId, manifest: begin.manifest };
      }
      if (begin.manifest && begin.manifest.status === "failed") throw codedError("publication_version_failed");

      for (const chunk of chunks) {
        await store.writeChunk(command.versionId, chunk);
        await store.verifyChunk(command.versionId, chunk);
      }

      const readyManifest = Object.freeze({
        ...buildingManifest,
        status: "ready",
        readyAt: now()
      });
      await store.finalizeVersion(command.versionId, readyManifest);
      const stored = await store.getManifest(command.versionId);
      if (!stored || stored.status !== "ready" || stored.manifestHash !== manifestHash) {
        throw codedError("publication_ready_verification_failed");
      }
      return { ok: true, reused: false, versionId: command.versionId, manifest: stored };
    } catch (error) {
      if (began) {
        await store.failVersion(command.versionId, error.code || "publication_stage_failed").catch(function () {});
      }
      throw error;
    }
  }

  async function switchPointer(request, action) {
    const command = request || {};
    safeSegment(command.versionId, "versionId");
    safeSegment(command.requestId, "requestId");
    if (!Object.prototype.hasOwnProperty.call(command, "expectedCurrentVersionId")) {
      throw codedError("publication_expected_current_required");
    }
    if (typeof command.actorUid !== "string" || !command.actorUid) throw codedError("publication_actor_required");
    const manifest = await store.getManifest(command.versionId);
    if (!manifest || manifest.status !== "ready") throw codedError("publication_version_not_ready");
    const eventId = "PUB-" + hashText(action + ":" + command.requestId).slice(0, 24).toUpperCase();
    return store.atomicSwitch({
      action,
      eventId,
      requestId: command.requestId,
      targetVersionId: command.versionId,
      expectedCurrentVersionId: command.expectedCurrentVersionId,
      actorUid: command.actorUid,
      reason: String(command.reason || ""),
      switchedAt: now(),
      manifest
    });
  }

  return Object.freeze({
    stage,
    activate: function (request) { return switchPointer(request, "publish"); },
    rollback: function (request) { return switchPointer(request, "rollback"); }
  });
}

module.exports = {
  OPERATIONAL_CHUNK_BYTES,
  OPERATIONAL_CHUNK_PATHS,
  chunkDescriptors,
  createPublicationService
};