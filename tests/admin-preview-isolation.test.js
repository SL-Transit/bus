const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const preview = fs.readFileSync(path.join(root, 'admin-erp-preview.html'), 'utf8');

if (!preview.includes('โหมดทดลองดูหน้าระบบ') || !preview.includes('ขณะนี้ยังไม่ส่งคำสั่งไปยังระบบจองจริง')) {
  throw new Error('preview banner missing');
}
if (!preview.includes('กำลังเชื่อมต่อระบบหลังบ้าน ยังไม่สามารถใช้คำสั่งนี้ได้')) {
  throw new Error('disabled action message missing');
}
if (!preview.includes('var ADMIN_PREVIEW_MODE = true')) {
  throw new Error('preview mode is not enabled');
}
if (/firebase\.database\(\)\.(ref|flush|goOffline)/.test(preview) || /\.ref\([^)]*\)\.(set|update|remove|transaction)\s*\(/.test(preview)) {
  throw new Error('preview contains a direct Firebase write');
}
for (const file of [
  'booking1.html', 'booking.html', 'booking-pos.js', 'booking-bridge.js',
  'booking1-preview-adapter.js', 'passenger.html', 'check_ticket.html',
  'cancel_ticket.html', 'functions/index.js', 'database.rules.json'
]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`missing protected file: ${file}`);
}
console.log('admin preview isolation ok');
