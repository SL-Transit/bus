const assert = require('assert');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const fs = require('fs');

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-sl-transit',
    database: { rules: fs.readFileSync('database.rules.json', 'utf8') }
  });
  try {
    const unauth = env.unauthenticatedContext().database();
    const user = env.authenticatedContext('ordinary-user').database();
    await assertFails(unauth.ref('bookings').once('value'));
    await assertFails(user.ref('bookings').once('value'));
    await assertFails(user.ref('publishedBookingControls/current/controls/test').set({ currentState: 'temporarily_closed' }));
    await assertSucceeds(unauth.ref('publishedSchedule').once('value'));
    await assertFails(unauth.ref('operations/bookingCapacityByServiceDate/2026-08-03/trip_1').once('value'));
  } finally {
    await env.cleanup();
  }
  console.log('admin-erp-emulator.test.js OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
