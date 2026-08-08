const admin = require('../functions/node_modules/firebase-admin');

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('ต้องใช้ระบบจำลอง Firebase เท่านั้น');
const projectId = process.env.GCLOUD_PROJECT || 'sl-transit-9464e';
process.env.GCLOUD_PROJECT = projectId;
admin.initializeApp({ projectId, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=sl-transit-9464e-default-rtdb` });

(async () => {
  const db = admin.database();
  const schedule = (await db.ref('publishedSchedule').get()).val() || {};
  const capacity = (await db.ref('operations/bookingCapacityByServiceDate/2099-01-01/pair-test').get()).val() || {};
  if (schedule.readyForApply !== false || !schedule.pairs || !schedule.pairs['pair-test']) throw new Error('ข้อมูลตารางเที่ยวจำลองไม่พร้อม');
  if (capacity.capacityLimit !== 20 || capacity.bookedSeats !== 0) throw new Error(`ข้อมูลที่นั่งจำลองไม่พร้อม: limit=${capacity.capacityLimit} booked=${capacity.bookedSeats}`);
  console.log(`emulator seed ready: capacityLimit=${capacity.capacityLimit} bookedSeats=${capacity.bookedSeats}`);
  await admin.app().delete();
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
