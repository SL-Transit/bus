const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'booking1.html'), 'utf8');

// booking1.html must use the single shared LINE In-App Browser guard (same
// script every other page loads) instead of its own page-local copy. A
// second, slightly-different implementation is exactly how this guard
// previously went stale (missed LIFF UAs) and shipped a silent-bypass bug
// that only got fixed in one copy, not the other.
assert(
  /<script src="site-runtime\.js\?v=[^"]+" data-sl-runtime><\/script>/.test(source),
  'Booking1 must load the shared site-runtime.js guard as the first script in <head>'
);
assert(
  source.indexOf('<script') === source.indexOf('<script src="site-runtime.js'),
  'The shared guard must be the first script in booking1.html <head>, same as every other page'
);

// Regression guards: none of the old page-local implementation should exist
// anymore. If any of these come back, someone re-introduced a duplicate.
assert(!source.includes('function isLineInAppBrowser()'), 'Booking1 must not reimplement its own LINE UA detector');
assert(!source.includes('function tryOpenExternal()'), 'Booking1 must not reimplement its own browser hand-off');
assert(!source.includes('initLineBrowserGuard'), 'Booking1 must not keep a page-local LINE guard IIFE');
assert(!source.includes('id="lineBrowserOverlay"'), 'Booking1 must not keep page-local overlay markup — the shared script builds its own');
assert(!source.includes('.line-browser-overlay'), 'Booking1 must not keep page-local overlay CSS — the shared script builds its own');

console.log('booking1 LINE browser guard (shared) ok');
