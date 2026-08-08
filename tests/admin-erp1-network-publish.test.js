const assert = require('assert');
const fs = require('fs');
const rules = JSON.parse(fs.readFileSync('database.rules.json', 'utf8')).rules;
const html = fs.readFileSync('admin-erp1.html', 'utf8');
const functions = fs.readFileSync('functions/index.js', 'utf8');

assert.strictEqual(rules.publishedSchedule['.read'], true);
assert.strictEqual(rules.publishedSchedule['.write'], false);
assert(html.includes('admin-erp1-integration.js'));
assert(html.includes('admin-erp1-network-integration.js'));
const integration = fs.readFileSync('admin-erp1-network-integration.js', 'utf8');
assert(integration.includes("ref('publishedSchedule')"));
assert(integration.includes('publishedSchedule'));
assert(functions.includes('exports.publishAdminSchedule'));
assert(functions.includes('decoded.slTransitRole !== "owner"'));
assert(functions.includes('noPublishedScheduleBehavior !== "hide"'));
console.log('admin-erp1 network publish contract ok');
