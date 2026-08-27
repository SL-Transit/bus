const line = require('../line-event-engine.js');

const message = line.checkinMessage({
  booking: {
    code: 'TB123456',
    name: 'Test Passenger',
    phone: '0800000000',
    seats: 2
  },
  origin: 'A',
  destination: 'B',
  etaMinutes: 7.4
});

if (!message.includes('TB123456')) throw new Error('ticket code missing');
if (!message.includes('Test Passenger')) throw new Error('passenger name missing');
if (!message.includes('0800000000')) throw new Error('phone missing');
if (!message.includes('A')) throw new Error('origin missing');
if (!message.includes('B')) throw new Error('destination missing');
if (!message.includes('7')) throw new Error('eta missing');
if (!message.includes('2')) throw new Error('seats missing');

const unknownEta = line.checkinMessage({ booking: { code: 'TB000001' }, etaMinutes: null });
if (!unknownEta.includes('-')) throw new Error('unknown eta fallback missing');

console.log('line-event-engine ok');
