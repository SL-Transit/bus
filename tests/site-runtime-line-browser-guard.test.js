const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'site-runtime.js'), 'utf8');

// Basic detection must cover both plain LINE in-app browser and LIFF webviews.
assert(source.includes("/\\bLine\\//i.test(ua)"), 'site-runtime.js must detect the LINE in-app browser UA token');
assert(source.includes("/\\bLIFF/i.test(ua)"), 'site-runtime.js must also detect LIFF webviews');

// Regression guard: the previous implementation issued an Android intent://
// redirect (or, on iOS, just reloaded the current page with a flag) and then
// unconditionally `return`ed. If the scheme redirect was silently ignored by
// LINE's webview (happens on some app/OS versions), nothing further ran: no
// overlay, no warning, page just worked normally inside LINE. Every page
// that includes this shared script must instead verify the hand-off actually
// happened (page backgrounded/unloaded) before giving up silently.
assert(
  source.includes('visibilitychange') && source.includes('pagehide'),
  'site-runtime.js must verify the browser hand-off actually happened (visibilitychange/pagehide) before assuming success'
);
assert(
  /setTimeout\(function \(\) \{\s*if \(left \|\| document\.hidden\) return;\s*showExitOverlay\(\);\s*\}, 1200\);/.test(source),
  'site-runtime.js must fall back to the manual exit overlay if the automatic hand-off does not visibly happen within the timeout'
);

// The overlay must still exist and offer a real external, non-LINE link.
assert(source.includes('showExitOverlay'), 'site-runtime.js must define a manual exit overlay renderer');
assert(source.includes('rel="external noopener"'), 'manual exit link must be marked to open externally');

// Every passenger-facing page must load the ONE shared guard — no page may
// keep (or reintroduce) its own separate copy. This is the single script
// tag, first thing in <head>, on every page below.
var PAGES = [
  'index.html', 'passenger.html', 'check_ticket.html', 'cancel_ticket.html',
  'info.html', 'booking1.html'
];
PAGES.forEach(function (page) {
  var pageSource = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
  assert(
    /<script src="site-runtime\.js\?v=[^"]+" data-sl-runtime><\/script>/.test(pageSource),
    page + ' must load the shared site-runtime.js LINE browser guard'
  );
});

// booking-pos.js used to carry a third, independent copy of this guard
// (with the same detection gap and the same silent-bypass bug). It must not
// come back — any page that eventually loads booking-pos.js is expected to
// load the shared site-runtime.js guard itself instead.
var bookingPosSource = fs.readFileSync(path.join(__dirname, '..', 'booking-pos.js'), 'utf8');
assert(!bookingPosSource.includes('function tryOpenExternal()'), 'booking-pos.js must not reimplement its own browser hand-off');
assert(!bookingPosSource.includes('_detectLineBrowser'), 'booking-pos.js must not reimplement its own LINE browser detector');

console.log('site-runtime.js LINE browser guard ok (shared across all pages)');
