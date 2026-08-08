import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errors = new Rate('test_errors');
const bookingErrors = new Rate('booking_errors');
const projectId = __ENV.FIREBASE_PROJECT_ID || 'sl-transit-9464e';
const authBase = __ENV.AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
const functionsBase = __ENV.FUNCTIONS_EMULATOR_URL || 'http://127.0.0.1:5001';
const databaseBase = __ENV.DATABASE_EMULATOR_URL || 'http://127.0.0.1:9000';
const runId = String(__ENV.K6_RUN_ID || 'missing').replace(/[^A-Za-z0-9_-]/g, '_');
const dbNs = 'sl-transit-9464e-default-rtdb';

export const options = {
  scenarios: {
    readers: { executor: 'constant-vus', vus: 80, duration: '30s', exec: 'readSchedule' },
    booking_burst: { executor: 'per-vu-iterations', vus: 20, iterations: 1, startTime: '5s', maxDuration: '20s', exec: 'bookOnce' }
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    checks: ['rate>0.95'],
    test_errors: ['rate<0.05'],
    booking_errors: ['rate==0']
  }
};

export function setup() {
  const email = `k6-${runId}-setup@example.test`;
  const auth = http.post(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key`, JSON.stringify({ email, password: 'TestOnly-123456!', returnSecureToken: true }), { headers: { 'Content-Type': 'application/json' } });
  const body = auth.json();
  if (!body || !body.idToken) throw new Error('สร้างบัญชีทดสอบในระบบจำลองไม่สำเร็จ');
  return { token: body.idToken };
}

export function readSchedule() {
  const schedule = http.get(`${databaseBase}/publishedSchedule.json?ns=${dbNs}`);
  const scheduleOk = check(schedule, { 'อ่านตารางเที่ยวสำเร็จ': (r) => r.status === 200 && r.body.includes('pair-test') });
  errors.add(!scheduleOk);
  const detail = http.get(`${databaseBase}/publishedSchedule/pairs/pair-test.json?ns=${dbNs}`);
  const detailOk = check(detail, { 'อ่านรายละเอียดเที่ยวสำเร็จ': (r) => r.status === 200 && r.body.includes('fareAmount') });
  errors.add(!detailOk);
  sleep(0.2);
}

export function bookOnce(data) {
  const code = `K6C-${runId}-${__VU}`;
  const params = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` }, responseCallback: http.expectedStatuses(200, 201, 409) };
  const reserve = http.post(`${functionsBase}/${projectId}/asia-southeast1/reserveBookingCapacity`, JSON.stringify({ action: 'reserve', serviceDate: '2099-01-01', capacityKey: 'pair-test', bookingCode: code, requestedSeats: 1 }), params);
  const reserveOk = check(reserve, { 'จองที่นั่งพร้อมกันโดยไม่เกิน 20 ที่นั่ง': (r) => r.status === 200 });
  errors.add(!reserveOk);
  bookingErrors.add(!reserveOk);
  if (!reserveOk) {
    if (__VU === 1) console.log(`reserve_status=${reserve.status} reserve_body=${reserve.body}`);
    return;
  }
  const booking = { code, bookingCode: code, name: 'TEST_ONLY', phone: '0800000000', pax: 1, date: '2099-01-01', time: '11:30', pickupTime: '11:30', origin: 'TEST_ONLY', destination: 'TEST_ONLY', pairKey: 'pair-test', fareAmount: 100, price: 110, fare: 110, paymentMode: 'onsite', testMode: true, mockOnly: true };
  const create = http.post(`${functionsBase}/${projectId}/asia-southeast1/createBooking`, JSON.stringify({ booking }), params);
  const createOk = check(create, { 'สร้างการจองพร้อมกันสำเร็จ': (r) => r.status === 201 });
  errors.add(!createOk);
  bookingErrors.add(!createOk);
  if (!createOk && __VU === 1) console.log(`create_status=${create.status} create_body=${create.body}`);
}
