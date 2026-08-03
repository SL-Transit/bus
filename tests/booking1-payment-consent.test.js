const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync(require('path').join(__dirname, '..', 'booking1.html'), 'utf8');

assert(source.includes('id="consentPaymentSummary"'), 'Consent dialog must show the selected payment details');
assert(source.includes('function renderConsentPaymentSummary()'), 'Consent payment summary renderer is required');
assert(source.includes("paymentMethod: currentPayMethod || 'onsite'"), 'Consent must capture the selected payment method');
assert(source.includes('BOOKING1_PAYMENT_CONTACT.bankName'), 'Consent bank details must use the same payment contact as the payment panel');
assert(source.includes("ไม่ต้องโอนเงินและไม่ต้องแนบสลิป"), 'Onsite payment consent must match the onsite payment option');
assert(source.includes("หลังโอนให้แนบสลิปในช่องที่กำหนด"), 'Bank payment consent must match the bank payment option');
assert(source.includes('id="consentCheck"'), 'Consent dialog must require an explicit checkbox');
assert(source.includes('function onConsentCheckChange()'), 'Consent checkbox must participate in acceptance gating');
assert(source.includes("fetch('info.html'"), 'Consent dialog must load the canonical long policy');
assert(source.includes("querySelector('#policy')"), 'Consent dialog must load the canonical policy section');
console.log('booking1 payment consent contract ok');
