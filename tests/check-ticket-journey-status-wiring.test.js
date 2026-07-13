const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'check_ticket.html'), 'utf8');

assert(html.includes('journey-status-center.js'), 'Check Ticket must load Journey Status Center');

function blockBetween(start, end) {
  const startIndex = html.indexOf(start);
  assert(startIndex !== -1, start + ' block missing');
  const endIndex = html.indexOf(end, startIndex + start.length);
  assert(endIndex !== -1, end + ' block boundary missing');
  return html.slice(startIndex, endIndex);
}

const arrivalBlock = blockBetween('function serviceArrivalInfo', 'function isServiceEnded');
assert(arrivalBlock.includes('SLTransitJourneyStatusCenter.arrivalInfo'), 'service arrival state must ask Journey Status Center');

const endedBlock = blockBetween('function isServiceEnded', 'function activeJourneyTarget');
assert(endedBlock.includes('SLTransitJourneyStatusCenter.serviceEnded'), 'service ended state must ask Journey Status Center');

const markArrivalBlock = blockBetween('function maybeMarkServiceArrival', 'function calculateTransferOrDestinationEta');
assert(markArrivalBlock.includes('SLTransitJourneyStatusCenter.journeyArrivalState'), 'journey arrival marking must ask Journey Status Center');

const pickupBlock = blockBetween('function isVanAtOrPastPickup', 'function maybeAutoOriginCheckin');
assert(pickupBlock.includes('SLTransitJourneyStatusCenter.originBoardingState'), 'pickup arrival state must ask Journey Status Center');

console.log('check-ticket journey status wiring ok');
