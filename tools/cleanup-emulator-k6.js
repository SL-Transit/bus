const admin = require('../functions/node_modules/firebase-admin');

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('ต้องกำหนดระบบจำลองก่อนล้างข้อมูล');
const projectId = process.env.GCLOUD_PROJECT || 'sl-transit-9464e';
const runId = String(process.env.K6_RUN_ID || '').replace(/[^A-Za-z0-9_-]/g, '_');
if (!runId) throw new Error('ต้องระบุรหัสรอบทดสอบ');
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
admin.initializeApp({ projectId, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=sl-transit-9464e-default-rtdb` });

async function removeUsers() {
  let next;
  do {
    const page = await admin.auth().listUsers(1000, next);
    const ids = page.users.filter((user) => String(user.email || '').startsWith(`k6-${runId}-`)).map((user) => user.uid);
    if (ids.length) await admin.auth().deleteUsers(ids);
    next = page.pageToken;
  } while (next);
}

async function main() {
  const db = admin.database();
  const bookings = await db.ref('bookings').get();
  const values = bookings.val() || {};
  const deletes = Object.keys(values).filter((code) => code.startsWith(`K6-${runId}-`)).map((code) => db.ref(`bookings/${code}`).remove());
  await Promise.all(deletes);
  await db.ref('publishedSchedule').remove();
  await db.ref('operations/bookingCapacityByServiceDate/2099-01-01/pair-test').remove();
  await db.ref('settings/systemTestMode').remove();
  await removeUsers();
  await admin.app().delete();
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
