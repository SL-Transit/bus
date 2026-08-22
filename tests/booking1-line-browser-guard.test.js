const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'booking1.html'), 'utf8');

assert(source.includes('function isLineInAppBrowser()'), 'Booking1 must detect LINE In-App Browser');
assert(source.includes('lineBrowserOverlay'), 'Booking1 must show the browser hand-off overlay');
assert(source.includes('function tryOpenExternal()'), 'Booking1 must offer external browser hand-off');
assert(source.includes("package=com.android.chrome"), 'Android hand-off must target Chrome');
assert(source.includes("googlechrome://"), 'iOS hand-off must target an external browser');
assert(source.includes("ext=1"), 'external browser hand-off must avoid reopening the guard');
assert(/\\bLIFF\\b/.test(source) || source.includes('/\\bLIFF/i'), 'Booking1 must also detect LIFF in-app browsers, not just Line/x.x UA strings');

// Regression guard for the silent-bypass bug: tryOpenExternal must never
// unconditionally reload the current (LINE) page with ext=1 after a timeout,
// since a failed hand-off would then permanently disable the overlay for the
// rest of the session and let a booking go through inside LINE unwarned.
const tryOpenExternalBody = source.slice(
  source.indexOf('function tryOpenExternal()'),
  source.indexOf('global.isLineInAppBrowser')
);
assert(
  !/setTimeout\(function \(\) \{ window\.location\.href = url; \}, 1500\);/.test(tryOpenExternalBody),
  'tryOpenExternal must not blindly reload the LINE page with ext=1 on a timeout — that silently disables the guard on failed hand-off'
);

console.log('booking1 LINE browser guard ok');
