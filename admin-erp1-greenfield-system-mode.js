(function (root) {
  'use strict';
  if (!root.document) return;
  root.document.addEventListener('DOMContentLoaded', function () {
    const badge = root.document.getElementById('greenfield-preview-badge');
    if (!badge) return;
    badge.hidden = false;
    badge.setAttribute('aria-live', 'polite');
    badge.textContent = 'Contract Preview · Backend not connected · No production writes';
    root.SLTransitGreenfieldSystemMode = Object.freeze({ mode: 'contract-preview', writesEnabled: false });
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);