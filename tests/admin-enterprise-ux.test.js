const fs = require('fs');
const html = fs.readFileSync('admin-erp.html', 'utf8');
const requiredPages = ['dashboard', 'today', 'bookings', 'tickets-refunds', 'alerts', 'workbook', 'announcements', 'roles', 'settings'];
for (const page of requiredPages) {
  if (!html.includes(`data-page="${page}"`)) throw new Error(`missing module: ${page}`);
}
if (!html.includes('console-page') || !html.includes('console-detail-grid')) throw new Error('enterprise page architecture missing');
if (html.includes('enhanceEnterpriseShell') || html.includes('insertAdjacentHTML')) throw new Error('enterprise UI must not be injected into the legacy renderer');
if (!html.includes('สถานะทางเทคนิค') || !html.includes('กำลังเชื่อมต่อระบบหลังบ้าน ยังไม่สามารถใช้คำสั่งนี้ได้')) throw new Error('technical/disabled state missing');
if (!html.includes('ข้อมูลการเดินทาง') || !html.includes('ข้อมูลผู้โดยสาร') || !html.includes('ประวัติรายการ')) throw new Error('booking detail sections missing');
if (!html.includes('ทั้งระบบ') || !html.includes('ป้ายขึ้นรถ') || !html.includes('ช่วงวันที่')) throw new Error('close-booking scopes missing');
if (!html.includes('Draft') || !html.includes('Review') || !html.includes('Publish')) throw new Error('ERP workflow missing');
if (!html.includes('overflow-x:hidden')) throw new Error('mobile overflow guard missing');
console.log('admin enterprise ux contract ok');
