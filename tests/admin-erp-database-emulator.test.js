'use strict';

const http = require('http');

const baseUrl = process.env.FIREBASE_DATABASE_EMULATOR_URL || 'http://127.0.0.1:9000';
const namespace = process.env.FIREBASE_DATABASE_EMULATOR_NAMESPACE || 'demo-sl-transit-default-rtdb';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    url.searchParams.set('ns', namespace);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  const publicReadPaths = [
    '/data/erpDataCenter/stops.json',
    '/data/erpDataCenter/serviceGroups.json',
    '/data/erpDataCenter/workbookSource/routeFareRows.json',
    '/data/erpDataCenter/workbookSource/scheduleRows.json',
    '/data/erpDataCenter/fleet/vehicles.json',
    '/data/erpDataCenter/fleet/queues.json'
  ];
  for (const path of publicReadPaths) {
    const read = await request('GET', path);
    if (read.status !== 200) throw new Error(`expected current public-read rule for ${path}, got ${read.status}`);
  }

  const protectedRead = await request('GET', '/data/erpDataCenter/finance.json');
  if (![401, 403].includes(protectedRead.status)) throw new Error(`protected finance read was not denied: ${protectedRead.status}`);

  const write = await request('PUT', '/data/erpDataCenter/emulatorSafetyProbe.json', { productionWrite: false });
  if (![401, 403].includes(write.status)) throw new Error(`unauthenticated write was not denied: ${write.status}`);

  console.log('admin-erp database emulator permission smoke test: PASS');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
