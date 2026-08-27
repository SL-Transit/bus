(function (root) {
  "use strict";
  if (!root.document) return;
  root.document.addEventListener("DOMContentLoaded", function () {
    const badge = root.document.getElementById("greenfield-preview-badge");
    if (!badge) return;
    const runtime = root.SLTransitGreenfieldRuntimeConfig || {};
    badge.hidden = false;
    badge.setAttribute("aria-live", "polite");
    badge.textContent = runtime.commandEndpoint
      ? "Phase 6A · Emulator backend configured · No production writes"
      : "Phase 6A · Runtime config required · No production writes";
    root.SLTransitGreenfieldSystemMode = Object.freeze({
      mode: "phase6a-integration-review",
      backendConfigured: Boolean(runtime.commandEndpoint),
      emulatorWritesEnabled: Boolean(runtime.commandEndpoint),
      productionWritesEnabled: false,
      writesEnabled: false
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);