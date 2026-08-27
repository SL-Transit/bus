const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rules = fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8');

assert.match(rules, /request\.auth\.token\.admin == true/, 'slip reads must require an admin claim');
assert.match(rules, /resource\.metadata\.ownerUid == request\.auth\.uid/, 'slip reads must be owner-scoped');
assert.match(rules, /request\.resource\.metadata\.ownerUid == request\.auth\.uid/, 'slip uploads must bind metadata to the owner');
assert.match(rules, /request\.resource\.size <= 5 \* 1024 \* 1024/, 'slip uploads must be size limited');
assert.match(rules, /image\/\(jpeg\|png\|webp\)/, 'slip uploads must use an allowlisted image content type');
assert.match(rules, /fileName\.matches/, 'slip file names must be constrained');
assert.match(rules, /allow update, delete: if false/, 'slips must not be mutable or deletable by clients');

console.log('storage security rules contract ok');
