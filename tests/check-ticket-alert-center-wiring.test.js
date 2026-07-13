const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

assert(html.includes('erp-alert-center.js'), 'Check Ticket must load ERP Alert Center');
assert(html.includes('function buildCheckTicketAlertPlan'), 'Check Ticket alert planner wrapper must exist');

const updateStart = html.indexOf('function updateBookingAndNotify');
const updateEnd = html.indexOf('function buildCheckTicketAlertPlan', updateStart);
assert(updateStart !== -1 && updateEnd !== -1, 'updateBookingAndNotify block missing');
const updateBlock = html.slice(updateStart, updateEnd);
assert(updateBlock.includes('buildCheckTicketAlertPlan'), 'Check Ticket notifications must ask Alert Center wrapper');
assert(updateBlock.includes('alertCenterOnceKey'), 'Check Ticket notification payload must carry Alert Center once key');
assert(updateBlock.includes('alertCenterRecipientRole'), 'Check Ticket notification payload must carry Alert Center recipient role');

const plannerStart = html.indexOf('function buildCheckTicketAlertPlan');
const plannerEnd = html.indexOf('function isEffectiveTestMode', plannerStart);
assert(plannerStart !== -1 && plannerEnd !== -1, 'alert planner block missing');
const plannerBlock = html.slice(plannerStart, plannerEnd);
assert(plannerBlock.includes('SLTransitAlertCenter.transferArrivalAlert'), 'Check Ticket alert planner must call Alert Center transfer alert');
assert(plannerBlock.includes('CHECKIN_RADIUS_KM'), 'transfer alert radius must come from configured Check Ticket radius');

console.log('check-ticket alert center wiring ok');
