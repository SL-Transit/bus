(function (root) {
  "use strict";
  if (!root.document) return;
  root.document.addEventListener("DOMContentLoaded", function () {
    const badge = root.document.getElementById("greenfield-preview-badge");
    if (!badge) return;
    const runtime = root.SLTransitGreenfieldRuntimeConfig || {};
    const memoryPreview = !runtime.commandEndpoint && Boolean(root.SLTransitGreenfieldDraftPreview);
    badge.hidden = false;
    badge.setAttribute("aria-live", "polite");
    badge.textContent = runtime.commandEndpoint
      ? "Phase 6A · Emulator backend configured · No production writes"
      : (memoryPreview
        ? "Phase 6A.2 · Memory-only Draft Review · No production writes"
        : "Phase 6A · Runtime config required · No production writes");
    root.SLTransitGreenfieldSystemMode = Object.freeze({
      mode: memoryPreview ? "phase6a-memory-draft-review" : "phase6a-integration-review",
      backendConfigured: Boolean(runtime.commandEndpoint),
      memoryPreviewEnabled: memoryPreview,
      emulatorWritesEnabled: Boolean(runtime.commandEndpoint),
      productionWritesEnabled: false,
      writesEnabled: false
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);