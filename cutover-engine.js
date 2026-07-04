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

  var REQUIRED_FILES = [
    'booking.html',
    'check_ticket.html',
    'passenger.html',
    'booking-bridge.js',
    'booking-capacity.js',
    'admin-erp.html',
    'driver-android/src/main/java/com/sanamchai/drivergps/GpsService.java'
  ];

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

  function buildCutoverChecklist(files) {
    var map = valueOrEmpty(files);
    var provided = Object.keys(map);
    var required = REQUIRED_FILES.map(function(name) {
      return { file: name, present: Object.prototype.hasOwnProperty.call(map, name) };
    });
    return {
      dryRun: true,
      required: required,
      missing: required.filter(function(item) { return !item.present; }).map(function(item) { return item.file; }),
      extra: provided.filter(function(name) { return REQUIRED_FILES.indexOf(name) === -1; })
    };
  }

  function buildCutoverReadiness(report) {
    var data = valueOrEmpty(report);
    var checklist = valueOrEmpty(data.checklist);
    var missing = Array.isArray(checklist.missing) ? checklist.missing.slice() : [];
    var blockers = Array.isArray(data.blockers) ? data.blockers.slice() : [];
    var warnings = Array.isArray(data.warnings) ? data.warnings.slice() : [];
    var nextActions = [];
    if (missing.length) nextActions.push('add required file text before review');
    if (blockers.length) nextActions.push('remove legacy Firebase project or database references');
    if (!missing.length && !blockers.length) nextActions.push('manual reviewer can inspect warnings before any switch');
    return {
      dryRun: true,
      readyForManualReview: missing.length === 0 && blockers.length === 0,
      readyForSwitch: false,
      missingFiles: missing,
      blockerCount: blockers.length,
      warningCount: warnings.length,
      nextActions: nextActions
    };
  }

  function buildCutoverReport(files) {
    var map = valueOrEmpty(files);
    var checklist = buildCutoverChecklist(files);
    var scans = Object.keys(map).map(function(name) { return scanText(name, map[name]); });
    var blockers = [];
    var warnings = [];
    scans.forEach(function(scan) {
      scan.findings.forEach(function(finding) {
        if (finding.level === 'blocker') blockers.push(finding);
        else warnings.push(finding);
      });
    });
    var report = {
      dryRun: true,
      target: Object.assign({}, TARGET),
      legacy: Object.assign({}, LEGACY),
      readyForSwitch: false,
      readyForManualReview: false,
      blockers: blockers,
      warnings: warnings,
      checklist: checklist,
      files: scans
    };
    report.readiness = buildCutoverReadiness(report);
    report.readyForManualReview = report.readiness.readyForManualReview;
    return report;
  }

  global.SLTransit = global.SLTransit || {};
  global.SLTransit.cutover = {
    TARGET: Object.assign({}, TARGET),
    LEGACY: Object.assign({}, LEGACY),
    REQUIRED_FILES: REQUIRED_FILES.slice(),
    scanText: scanText,
    buildCutoverChecklist: buildCutoverChecklist,
    buildCutoverReport: buildCutoverReport
  };
})(window);
