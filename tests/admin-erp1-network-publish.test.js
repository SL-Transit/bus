const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync('admin-erp1.html', 'utf8');

assert(html.includes('admin-erp1-integration.js'));
assert(html.includes('admin-erp1-network-integration.js'));
const integration = fs.readFileSync('admin-erp1-network-integration.js', 'utf8');
assert(integration.includes("ref('publishedSchedule')"));
assert(integration.includes('publishedSchedule'));
assert(integration.includes('publishAdminSchedule'));
assert(integration.includes('ไม่มีตารางที่เผยแพร่'));
console.log('admin-erp1 network publish contract ok');
