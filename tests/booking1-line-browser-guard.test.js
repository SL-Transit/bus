const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'booking1.html'), 'utf8');

assert(source.includes('function isLineInAppBrowser()'), 'Booking1 must detect LINE In-App Browser');
assert(source.includes('lineBrowserOverlay'), 'Booking1 must show the browser hand-off overlay');
assert(source.includes('function tryOpenExternal()'), 'Booking1 must offer external browser hand-off');
assert(source.includes("package=com.android.chrome"), 'Android hand-off must target Chrome');
assert(source.includes("googlechrome://"), 'iOS hand-off must target an external browser');
assert(source.includes("ext=1"), 'external browser hand-off must avoid reopening the guard');
console.log('booking1 LINE browser guard ok');
