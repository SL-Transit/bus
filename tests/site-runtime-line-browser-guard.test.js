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

console.log('site-runtime.js LINE browser guard ok');
