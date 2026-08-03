const assert = require('assert');
const fs = require('fs');

const manifest = fs.readFileSync('driver-android/src/main/AndroidManifest.xml', 'utf8');
const main = fs.readFileSync('driver-android/src/main/java/com/sanamchai/drivergps/MainActivity.java', 'utf8');

assert.match(manifest, /android:allowBackup="false"/, 'driver app backup must remain disabled');
assert.match(manifest, /android:usesCleartextTraffic="false"/, 'driver app must reject cleartext network traffic');
assert.match(main, /setAllowFileAccess\(false\)/, 'driver map WebView must not read local files');
assert.match(main, /setAllowContentAccess\(false\)/, 'driver map WebView must not read content providers');
assert.match(main, /MIXED_CONTENT_NEVER_ALLOW/, 'driver map WebView must reject mixed content');
assert.match(main, /setSafeBrowsingEnabled\(true\)/, 'driver map WebView must enable safe browsing');

console.log('driver android security contract ok');
