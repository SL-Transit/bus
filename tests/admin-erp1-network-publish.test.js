const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync('admin-erp1.html', 'utf8');

assert(html.includes('admin-erp1-integration.js'));
assert(!html.includes('admin-erp1-network-integration.js'));
assert(!html.includes('Network Schedule Center'));
assert(!html.includes('publishAdminSchedule'));
assert(!html.includes("ref('publishedSchedule')"));
console.log('admin-erp1 legacy network panel is not active');
