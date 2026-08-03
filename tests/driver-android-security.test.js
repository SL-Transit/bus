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
assert.match(main, /shouldOverrideUrlLoading/, 'driver map WebView must control navigation');
assert.match(main, /sl-transit\.com/, 'driver map WebView must allowlist the trusted site');
assert.match(main, /isTrustedUpdateUrl/, 'driver app update must validate the download address');
assert.match(main, /\"https\"\.equalsIgnoreCase\(scheme\)/, 'driver updates must require HTTPS');
assert.match(main, /firebasestorage\.googleapis\.com/, 'driver updates must use the approved storage host');
assert.match(main, /DownloadManager\.STATUS_SUCCESSFUL/, 'driver must verify the download completed before installing');
assert.match(main, /redactSensitiveLogText/, 'driver diagnostics must remove sensitive values');
assert.doesNotMatch(main, /extra\.put\(\"coords\"/, 'driver diagnostics must not store precise coordinates');

console.log('driver android security contract ok');
