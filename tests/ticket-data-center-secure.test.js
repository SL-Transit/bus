const assert = require('assert');
const TicketDataCenter = require('../ticket-data-center');

(async function run() {
  const originalFetch = global.fetch;
  let fetchBody = null;
  global.location = { search: '?code=BK1234567&ticketToken=secure_ticket_token_12345678901234567890' };
  global.sessionStorage = {
    store: {},
    getItem(key) { return this.store[key] || ''; },
    setItem(key, value) { this.store[key] = String(value); }
  };
  global.fetch = async (url, options) => {
    fetchBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        status: 'ready',
        ticket: {
          code: 'BK1234567',
          status: 'awaiting_payment',
          date: '2026-07-30',
          time: '09:00',
          origin: 'BKK',
          destination: 'CNX',
          pax: 1
        }
      })
    };
  };

  const found = await TicketDataCenter.findTicket(null, 'BK1234567');
  assert.strictEqual(fetchBody.bookingCode, 'BK1234567');
  assert.strictEqual(fetchBody.accessToken, 'secure_ticket_token_12345678901234567890');
  assert.strictEqual(found.lookupType, 'secure_token');
  assert.strictEqual(found.readPath, '');
  assert.strictEqual(found.booking.code, 'BK1234567');

  delete global.location;
  delete global.sessionStorage;
  await assert.rejects(
    () => TicketDataCenter.findTicket(null, 'BK1234567'),
    /TICKET_ACCESS_TOKEN_REQUIRED/
  );
  await assert.rejects(
    () => TicketDataCenter.findTicket(null, '0800000000'),
    /TICKET_PHONE_LOOKUP_REQUIRES_SECURE_TOKEN/
  );

  global.fetch = originalFetch;
  console.log('ticket-data-center-secure.test.js OK');
})();
