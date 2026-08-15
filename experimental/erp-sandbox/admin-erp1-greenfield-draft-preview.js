(function (root, factory) {
  const validator = typeof module === "object" && module.exports
    ? require("./contracts/greenfield-erp/v1/runtime/validate-network-package.js")
    : root && root.SLTransitGreenfieldValidator;
  const api = factory(validator);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SLTransitGreenfieldDraftPreview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Validator) {
  "use strict";

  const MAX_IMPORT_PACKAGE_BYTES = 25 * 1024 * 1024;
  const MAX_PAGE_ITEMS = 50;
  const REVIEW_ENTITY_IDS = Object.freeze({
    operators: "operatorId",
    locations: "locationId",
    routes: "routeId",
    journeyPatterns: "journeyPatternId",
    serviceCalendars: "serviceCalendarId",
    fixedTrips: "fixedTripId",
    stopTimes: "stopTimeId",
    frequencyServices: "frequencyServiceId",
    fareProducts: "fareProductId",
    fareRules: "fareRuleId",
    transferRules: "transferRuleId"
  });

  function previewError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function utf8Bytes(value) {
    const text = String(value);
    if (typeof Buffer !== "undefined") return Buffer.byteLength(text, "utf8");
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }

  function summary(pkg) {
    return Object.keys(REVIEW_ENTITY_IDS).reduce(function (result, key) {
      result[key] = Array.isArray(pkg && pkg[key]) ? pkg[key].length : 0;
      return result;
    }, {});
  }

  function total(summaryValue) {
    return Object.values(summaryValue).reduce(function (sum, count) { return sum + count; }, 0);
  }

  function draftId(pkg) {
    const checksum = pkg && pkg.metadata && pkg.metadata.sourceChecksumSha256 || "";
    const checksumToken = checksum.replace(/^sha256:/, "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    const packageToken = String(pkg && pkg.metadata && pkg.metadata.packageId || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    return "DRF-" + (checksumToken || packageToken).padEnd(24, "0").slice(0, 24);
  }

  function createDraftReview(input) {
    const options = input || {};
    const pkg = options.package;
    if (!Validator || typeof Validator.validateNetworkPackage !== "function") {
      throw previewError("greenfield_validator_unavailable");
    }
    const serialized = JSON.stringify(pkg || null);
    const packageBytes = utf8Bytes(serialized);
    if (packageBytes > MAX_IMPORT_PACKAGE_BYTES) {
      return { ok: false, code: "import_package_too_large", errors: [] };
    }
    const errors = Validator.validateNetworkPackage(pkg);
    if (errors.length) {
      return {
        ok: false,
        code: "validation_failed",
        errors: copy(errors),
        report: { errors: copy(errors), warnings: [], errorCount: errors.length, warningCount: 0 }
      };
    }
    const counts = summary(pkg);
    const id = draftId(pkg);
    const review = {
      draftId: id,
      status: "draft",
      revision: 1,
      validationStatus: "valid",
      validatedRevision: 1,
      schemaVersion: pkg.metadata.schemaVersion,
      templateVersion: pkg.metadata.templateVersion,
      mappingVersion: String(options.mappingVersion || "canonical-json"),
      sourceChecksumSha256: pkg.metadata.sourceChecksumSha256,
      operatorScope: copy(pkg.metadata.operatorScope),
      packageBytes,
      entityCount: total(counts),
      summary: counts,
      storageMode: "memory_only",
      operationalRecordsExcluded: true
    };
    return {
      ok: true,
      draft: {
        draftId: id,
        status: "draft",
        revision: 1,
        validationStatus: "valid",
        validatedRevision: 1,
        package: copy(pkg),
        review
      },
      report: { errors: [], warnings: [], errorCount: 0, warningCount: 0 }
    };
  }

  function publicReview(draft) {
    if (!draft || !draft.review) return null;
    return copy(draft.review);
  }

  function readPage(draft, options) {
    if (!draft || !draft.package) throw previewError("preview_draft_required");
    const input = options || {};
    const entityType = String(input.entityType || "");
    const idField = REVIEW_ENTITY_IDS[entityType];
    const limit = input.limit === undefined ? 25 : input.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_ITEMS) throw previewError("draft_page_limit_invalid");
    if (!idField) {
      return {
        draftId: draft.draftId,
        status: draft.status,
        revision: draft.revision,
        validationStatus: draft.validationStatus,
        validatedRevision: draft.validatedRevision,
        entityType,
        entries: [],
        nextCursor: null,
        hasMore: false,
        redacted: true
      };
    }
    const cursor = input.cursor || null;
    const values = (draft.package[entityType] || []).map(function (value) {
      return { entityId: String(value[idField] || ""), value: copy(value) };
    }).filter(function (entry) {
      return entry.entityId && (!cursor || entry.entityId > cursor);
    }).sort(function (left, right) {
      return left.entityId.localeCompare(right.entityId);
    });
    const entries = values.slice(0, limit);
    return {
      draftId: draft.draftId,
      status: draft.status,
      revision: draft.revision,
      validationStatus: draft.validationStatus,
      validatedRevision: draft.validatedRevision,
      entityType,
      entries,
      nextCursor: values.length > entries.length && entries.length ? entries[entries.length - 1].entityId : null,
      hasMore: values.length > entries.length,
      redacted: false
    };
  }

  function requestReview(draft) {
    if (!draft || draft.validationStatus !== "valid" || draft.validatedRevision !== draft.revision) {
      throw previewError("review_blocked");
    }
    draft.status = "review_requested";
    draft.review.status = "review_requested";
    return { draftId: draft.draftId, revision: draft.revision, status: draft.status };
  }

  return Object.freeze({
    MAX_IMPORT_PACKAGE_BYTES,
    MAX_PAGE_ITEMS,
    REVIEW_ENTITY_IDS,
    createDraftReview,
    publicReview,
    readPage,
    requestReview,
    summary,
    utf8Bytes
  });
});