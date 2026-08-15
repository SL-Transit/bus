const admin = require('../functions/node_modules/firebase-admin');

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('ต้องกำหนดระบบจำลองก่อนเริ่ม');
const projectId = process.env.GCLOUD_PROJECT || 'sl-transit-9464e';
const runId = String(process.env.K6_RUN_ID || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
process.env.GCLOUD_PROJECT = projectId;
admin.initializeApp({ projectId, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=sl-transit-9464e-default-rtdb` });

admin.database().ref('settings/systemTestMode').set({ enabled: false, mockOnly: true, noPaidConnections: true, testOnly: true })
  .then(() => admin.database().ref('publishedSchedule').set({
    readyForApply: false,
    schemaVersion: 'k6-emulator-test',
  pairs: { 'pair-test': { pairKey: 'pair-test', fareAmount: 100, fareContract: { serviceFeeAmount: 10 }, routeName: 'TEST_ONLY', scheduleOfferId: 'trip-test-1130', departureTime: '11:30', routeId: 'route-test' } }
  }))
  .then(() => admin.database().ref('operations/bookingCapacityByServiceDate/2099-01-01/pair-test').set({
    contractVersion: 'booking_capacity_v1', capacityLimit: 20, bookedSeats: 0, seatsAvailable: 20, bookings: {}
  }))
  .then(() => admin.app().delete())
  .then(() => { console.log(runId); })
  .catch((error) => { console.error(error.message); process.exitCode = 1; });
