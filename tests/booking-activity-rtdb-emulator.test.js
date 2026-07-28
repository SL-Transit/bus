const assert = require('assert');
let admin;
try {
  admin = require('firebase-admin');
} catch (err) {
  admin = require('../functions/node_modules/firebase-admin');
}
const aggregate = require('../functions/booking-activity-aggregate.js');

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'sl-transit-9464e';

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT,
    databaseURL: 'http://127.0.0.1:9000?ns=sl-transit-9464e-default-rtdb'
  });
}

async function main() {
  const db = admin.database();
  await db.ref('bookings').set(null);
  const today = '2026-07-28';
  const window = aggregate.queryWindow('daily', today);
  const insideTs = Date.parse('2026-07-28T09:00:00+07:00');
  const outsideTs = Date.parse('2026-06-28T09:00:00+07:00');
  await db.ref('bookings').set({
    BK_INSIDE_001: {
      code: 'BK_INSIDE_001',
      ts: insideTs,
      source: 'booking1.html',
      sourceMode: 'erp_data_center',
      date: '2026-07-29',
      origin: 'A',
      destination: 'B',
      pax: 1,
      status: 'awaiting_payment'
    },
    BK_OUTSIDE_001: {
      code: 'BK_OUTSIDE_001',
      ts: outsideTs,
      source: 'booking1.html',
      sourceMode: 'erp_data_center',
      date: '2026-07-28',
      origin: 'A',
      destination: 'B',
      pax: 1,
      status: 'awaiting_payment'
    }
  });
  const snap = await db.ref('bookings').orderByChild('ts').startAt(window.startMs).endAt(window.endMs).get();
  const value = snap.val() || {};
  assert.deepStrictEqual(Object.keys(value), ['BK_INSIDE_001'], 'RTDB query must use indexed ts range, not the whole bookings root');
  const output = aggregate.aggregateBookingActivity(value, { range: 'daily', anchor: today });
  assert.strictEqual(output.points.find((point) => point.key === today).bookings, 1);
  await db.ref('bookings').set(null);
  await admin.app().delete();
  console.log('booking activity rtdb emulator ok');
}

main().catch(async (err) => {
  console.error(err);
  try { await admin.app().delete(); } catch (e) { /* noop */ }
  process.exit(1);
});
