const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'booking1.html'), 'utf8');

assert(source.includes("paymentMethod: currentPayMethod || 'onsite'"), 'Consent must capture the selected payment method');
assert(source.includes('id="consentCheck"'), 'Consent dialog must require an explicit checkbox');
assert(source.includes('function onConsentCheckChange()'), 'Consent checkbox must participate in acceptance gating');
assert(source.includes("fetch('info.html'"), 'Consent dialog must load the canonical long policy');
assert(source.includes("querySelector('#policy')"), 'Consent dialog must load the canonical policy section');
assert(source.includes('Always prefer the canonical full policy'), 'Canonical full policy must take precedence over short settings text');
assert(!source.includes('id="consentPaymentSummary"'), 'Consent popup must not show a duplicate payment summary');
assert(!source.includes('class="consent-canonical-link"'), 'Consent popup must not show a duplicate policy link');
console.log('booking1 payment consent contract ok');
