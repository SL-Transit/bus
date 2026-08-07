import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errors = new Rate('test_errors');
const projectId = __ENV.FIREBASE_PROJECT_ID || 'sl-transit-9464e';
const authBase = __ENV.AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
const functionsBase = __ENV.FUNCTIONS_EMULATOR_URL || 'http://127.0.0.1:5001';
const databaseBase = __ENV.DATABASE_EMULATOR_URL || 'http://127.0.0.1:9000';
const runId = String(__ENV.K6_RUN_ID || 'missing').replace(/[^A-Za-z0-9_-]/g, '_');

export const options = {
  scenarios: {
    staged_low_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { target: 50, duration: '30s' },
        { target: 50, duration: '9m30s' },
        { target: 100, duration: '30s' },
        { target: 100, duration: '9m30s' },
        { target: 300, duration: '30s' },
        { target: 300, duration: '9m30s' },
        { target: 0, duration: '30s' }
      ],
      gracefulRampDown: '30s'
    }
  },
  thresholds: { http_req_failed: ['rate<0.05'], http_req_duration: ['p(95)<1000', 'p(99)<2000'], checks: ['rate>0.95'], test_errors: ['rate<0.05'] }
};

export function setup() {
  const email = `k6-${runId}-setup@example.test`;
  const auth = http.post(`${authBase}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key`, JSON.stringify({ email, password: 'TestOnly-123456!', returnSecureToken: true }), { headers: { 'Content-Type': 'application/json' } });
  const body = auth.json();
  if (!body || !body.idToken) throw new Error('สร้างบัญชีทดสอบในระบบจำลองไม่สำเร็จ');
  return { token: body.idToken };
}

export default function (data) {
  const code = `K6-${runId}-${__VU}-${__ITER}`;
  const params = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` }, responseCallback: http.expectedStatuses(200, 201, 409) };
  const schedule = http.get(`${databaseBase}/publishedSchedule.json?ns=sl-transit-9464e-default-rtdb`);
  const scheduleOk = check(schedule, { 'อ่านตารางเที่ยวสำเร็จ': (r) => r.status === 200 && r.body.includes('pair-test') });
  errors.add(!scheduleOk);

  const detail = http.get(`${databaseBase}/publishedSchedule/pairs/pair-test.json?ns=sl-transit-9464e-default-rtdb`);
  const detailOk = check(detail, { 'อ่านรายละเอียดเที่ยวสำเร็จ': (r) => r.status === 200 && r.body.includes('fareAmount') });
  errors.add(!detailOk);

  const booking = { code, bookingCode: code, name: 'TEST_ONLY', phone: '0800000000', pax: 1, date: '2099-01-01', time: '11:30', pickupTime: '11:30', origin: 'TEST_ONLY', destination: 'TEST_ONLY', pairKey: 'pair-test', fareAmount: 100, price: 110, fare: 110, paymentMode: 'onsite', testMode: true, mockOnly: true };
  const create = http.post(`${functionsBase}/${projectId}/asia-southeast1/createBooking`, JSON.stringify({ booking }), params);
  const createOk = check(create, { 'สร้างรายการทดสอบสำเร็จ': (r) => r.status === 201 });
  errors.add(!createOk);

  const replay = http.post(`${functionsBase}/${projectId}/asia-southeast1/createBooking`, JSON.stringify({ booking }), params);
  const replayOk = check(replay, { 'คำขอซ้ำถูกปฏิเสธ': (r) => r.status === 409 });
  errors.add(!replayOk);
  sleep(0.2);
}
