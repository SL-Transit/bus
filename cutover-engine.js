(function(global) {
  'use strict';

  var TARGET = {
    projectId: 'sl-transit-9464e',
    databaseURL: 'https://sl-transit-9464e-default-rtdb.asia-southeast1.firebasedatabase.app'
  };

  var LEGACY = {
    projectId: 'bus-booking-1d68c',
    databaseURL: 'https://bus-booking-1d68c-default-rtdb.firebaseio.com'
  };

  function valueOrEmpty(value) {
    return value && typeof value === 'object' ? value : {};
  }

  function scanText(filename, text) {
    var body = String(text || '');
    var findings = [];
    if (body.indexOf(LEGACY.projectId) >= 0) findings.push({ level: 'blocker', code: 'legacy-project-id', file: filename });
    if (body.indexOf(LEGACY.databaseURL) >= 0) findings.push({ level: 'blocker', code: 'legacy-database-url', file: filename });
    if (body.indexOf(TARGET.projectId) < 0 && /firebase|databaseURL|DB_URL/.test(body)) findings.push({ level: 'warning', code: 'target-project-not-detected', file: filename });
    return {
      file: filename,
      hasTargetProject: body.indexOf(TARGET.projectId) >= 0,
      hasTargetDatabase: body.indexOf(TARGET.databaseURL) >= 0,
      findings: findings
    };
  }

  function buildCutoverReport(files) {
    var map = valueOrEmpty(files);
    var scans = Object.keys(map).map(function(name) { return scanText(name, map[name]); });
    var blockers = [];
    var warnings = [];
    scans.forEach(function(scan) {
      scan.findings.forEach(function(finding) {
        if (finding.level === 'blocker') blockers.push(finding);
        else warnings.push(finding);
      });
    });
    return {
      dryRun: true,
      target: Object.assign({}, TARGET),
      legacy: Object.assign({}, LEGACY),
      readyForSwitch: false,
      readyForManualReview: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      files: scans
    };
  }

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.cutover = {
    TARGET: Object.assign({}, TARGET),
    LEGACY: Object.assign({}, LEGACY),
    scanText: scanText,
    buildCutoverReport: buildCutoverReport
  };
})(window);
