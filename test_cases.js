// ============================================================
// test_cases.js — Smart Ticket Website Test Cases
// ห้ามแก้ logic เดิม | ห้ามเช็คอินจริง | ห้าม inject Firebase
// ============================================================

function _getTomorrowDate() {
  var d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

var TEST_CASES = {

  // ─────────────────────────────────────────────────────────
  //  หมวด 1: booking.html — หน้าจองตั๋ว
  // ─────────────────────────────────────────────────────────
  booking: [

    // ══ กลุ่ม A: แสดงตารางเวลา ══
    {
      id: 'BK-A01',
      name: 'แปดริ้ว → สนามชัย: ต้องมีตารางเวลา',
      from: 'chachoengsao', to: 'sanamchai',
      autoCheck: 'times',
      expect: { hasTimes: true },
      description: 'เลือกต้นทาง=แปดริ้ว ปลายทาง=สนามชัย ต้องแสดง time slot ≥1 ช่อง'
    },
    {
      id: 'BK-A02',
      name: 'แปดริ้ว → หนองคอก: เวลาต้องครบ',
      from: 'chachoengsao', to: 'nongkhok',
      autoCheck: 'times',
      expect: { hasTimes: true, includesTimes: ['11:20','14:00','17:20'] },
      description: 'ต้องมีเวลา 11:20, 14:00, 17:20 ตาม CHACHOENGSAO_TIMES'
    },
    {
      id: 'BK-A03',
      name: 'แปดริ้ว → คลองหาด: เวลาต้องครบ',
      from: 'chachoengsao', to: 'klonghat',
      autoCheck: 'times',
      expect: { hasTimes: true, includesTimes: ['11:20','14:00'] },
      description: 'ต้องมีเวลา 11:20, 14:00 ตาม CHACHOENGSAO_TIMES'
    },
    {
      id: 'BK-A04',
      name: 'สนามชัย → แปดริ้ว: ต้องมีตารางเวลา',
      from: 'sanamchai', to: 'chachoengsao',
      autoCheck: 'times',
      expect: { hasTimes: true },
      description: 'เส้นทางย้อนกลับ ต้องแสดงตารางเวลา'
    },
    {
      id: 'BK-A05',
      name: 'หนองคอก → แปดริ้ว: ต้องมีตารางเวลา',
      from: 'nongkhok', to: 'chachoengsao',
      autoCheck: 'times',
      expect: { hasTimes: true },
      description: 'หนองคอก→แปดริ้ว ต้องแสดงตารางเวลา'
    },
    {
      id: 'BK-A06',
      name: 'แปดริ้ว → เอกมัย: Leg2 ต้องมีตารางเวลา',
      from: 'chachoengsao', to: 'ekkamai',
      autoCheck: 'times',
      expect: { hasTimes: true, includesTimes: ['06:30','08:30','10:30','15:30','17:30'] },
      description: 'Leg2 แปดริ้ว→เอกมัย ต้องแสดงเวลา LEG2_TIMES_EKKAMAI จาก booking.html'
    },
    {
      id: 'BK-A07',
      name: 'แปดริ้ว → หมอชิต: Leg2 ต้องมีตารางเวลา',
      from: 'chachoengsao', to: 'mochit',
      autoCheck: 'times',
      expect: { hasTimes: true, includesTimes: ['06:00','08:00','11:00','13:00','15:00','17:00','18:00'] },
      description: 'Leg2 แปดริ้ว→หมอชิต ต้องแสดงเวลา LEG2_TIMES_MOCHIT จาก booking.html'
    },
    {
      id: 'BK-A08',
      name: 'แปดริ้ว → พัทยา: Leg2 ต้องมีตารางเวลา',
      from: 'chachoengsao', to: 'pattaya',
      autoCheck: 'times',
      expect: { hasTimes: true, includesTimes: ['05:40','07:00','11:20','14:00','17:00'] },
      description: 'Leg2 แปดริ้ว→พัทยา ต้องแสดงเวลา LEG2_TIMES_COMMON จาก booking.html'
    },
    {
      id: 'BK-A09',
      name: 'ท่าตะเกียบ → พัทยา: ต้องมีตารางเวลา requiresTransfer',
      from: 'tatakiab', to: 'pattaya',
      autoCheck: 'times',
      expect: { hasTimes: true, includesTimes: ['06:35','09:45','13:15'] },
      description: 'ต้นทางในเส้นทางหลักไปกลุ่มอื่น ต้องใช้เวลาขาแรกไปแปดริ้ว ไม่ใช่รายการว่าง'
    },

    {
      id: 'BK-A11',
      name: 'สนามชัย → เอกมัย: ต้องมีตารางเวลา requiresTransfer',
      from: 'sanamchai', to: 'ekkamai',
      autoCheck: 'times',
      expect: { hasTimes: true, includesTimes: ['06:20','07:20','09:00','10:40','12:10','13:40','14:00'] },
      description: 'ต้นทางสนามชัยไปกลุ่มเอกมัย ต้องโชว์เวลาขาแรกจากสนามชัยไปแปดริ้ว'
    },
    {
      id: 'BK-A10',
      name: 'ต้นทาง=ปลายทาง: ระบบต้องเปลี่ยน auto',
      from: 'chachoengsao', to: 'chachoengsao',
      autoCheck: 'origin_dest_diff',
      expect: { originNotEqualDest: true },
      description: 'updateRoute() ต้องป้องกันต้นทาง=ปลายทาง โดย auto-correct ปลายทาง'
    },

    // ══ กลุ่ม B: ราคา ══
    {
      id: 'BK-B01',
      name: 'ราคา: แปดริ้ว → สนามชัย = 55 บาท',
      from: 'chachoengsao', to: 'sanamchai',
      autoCheck: 'price',
      expect: { price: 55 },
      description: 'ROUTE_PRICE[sanamchai]=55 หรือ ORIGIN_PRICE logic'
    },
    {
      id: 'BK-B02',
      name: 'ราคา: สนามชัย → แปดริ้ว = 55 บาท',
      from: 'sanamchai', to: 'chachoengsao',
      autoCheck: 'price',
      expect: { price: 55 },
      description: 'ORIGIN_PRICE[sanamchai]=55'
    },
    {
      id: 'BK-B03',
      name: 'ราคา: แปดริ้ว → คลองหาด = 160 บาท',
      from: 'chachoengsao', to: 'klonghat',
      autoCheck: 'price',
      expect: { price: 160 },
      description: 'ROUTE_PRICE[klonghat]=160'
    },
    {
      id: 'BK-B04',
      name: 'ราคา: ท่าตะเกียบ → แปดริ้ว = 100 บาท',
      from: 'tatakiab', to: 'chachoengsao',
      autoCheck: 'price',
      expect: { price: 100 },
      description: 'ORIGIN_PRICE[tatakiab]=100'
    },

    {
      id: 'BK-B05',
      name: 'ราคา: แปดริ้ว → เอกมัย = 120 บาท',
      from: 'chachoengsao', to: 'ekkamai',
      autoCheck: 'price',
      expect: { price: 120 },
      description: 'LEG2_DEST[ekkamai].price=120 จาก booking.html'
    },
    {
      id: 'BK-B06',
      name: 'ราคา: สนามชัย → เอกมัย = 175 บาท',
      from: 'sanamchai', to: 'ekkamai',
      autoCheck: 'price',
      expect: { price: 175 },
      description: 'ORIGIN_PRICE[sanamchai] 55 + LEG2_DEST[ekkamai].price 120'
    },
    {
      id: 'BK-B07',
      name: 'ราคา: ท่าตะเกียบ → พัทยา = 240 บาท',
      from: 'tatakiab', to: 'pattaya',
      autoCheck: 'price',
      expect: { price: 240 },
      description: 'ORIGIN_PRICE[tatakiab] 100 + LEG2_DEST[pattaya].price 140'
    },

    // ══ กลุ่ม C: ปุ่มที่นั่ง ══
    {
      id: 'BK-C01',
      name: 'ปุ่ม seat: เพิ่ม/ลดได้ ไม่ต่ำกว่า 1',
      autoCheck: 'seat_selector',
      expect: { seatMin: 1, seatMax: 10 },
      description: 'กด + เพิ่ม กด - ลด min=1 max=10'
    }
  ],

  // ─────────────────────────────────────────────────────────
  //  หมวด 2: check_ticket.html — หน้าตรวจตั๋ว
  // ─────────────────────────────────────────────────────────
  checkin: [

    // ══ กลุ่ม A: lookup ══
    {
      id: 'CK-A01',
      name: 'ค้นหาว่าง: ต้องแสดง error ไม่ crash',
      input: '',
      autoCheck: 'empty_input',
      expect: { showError: true, noException: true },
      description: 'กดค้นหาโดยไม่กรอก ต้องแสดงข้อความ "กรุณากรอก"'
    },
    {
      id: 'CK-A02',
      name: 'ค้นหา format ผิด: ต้องจัดการ gracefully',
      input: 'INVALID!!',
      autoCheck: 'invalid_format',
      expect: { noException: true },
      description: 'กรอก INVALID!! ต้องไม่ throw exception'
    },
    {
      id: 'CK-A03',
      name: 'ค้นหา BK format ถูก: ต้อง pass regex',
      input: 'BK123456',
      autoCheck: 'lookup_format',
      expect: { passRegex: true },
      description: '/^(BK|TB)\\d{6}$/ ต้อง match BK123456'
    },
    {
      id: 'CK-A04',
      name: 'ค้นหาเบอร์โทร: 0812345678 ต้อง pass regex',
      input: '0812345678',
      autoCheck: 'lookup_format',
      expect: { passRegex: true },
      description: '/^0[689]\\d{8}$/ ต้อง match 0812345678'
    },

    // ══ กลุ่ม B: connectionRouteInfo logic ══
    {
      id: 'CK-B01',
      name: 'เส้นทาง: แปดริ้ว → สนามชัย = main_route',
      route: 'ฉะเชิงเทรา (แปดริ้ว) → ท่ารถสนามชัยเขต',
      autoCheck: 'route_type',
      expect: { routeType: 'main_route' },
      description: 'connectionRouteInfo ต้องคืน main_route สำหรับเส้นทางหลัก'
    },
    {
      id: 'CK-B02',
      name: 'เส้นทาง: แปดริ้ว → หนองคอก = main_route',
      route: 'ฉะเชิงเทรา (แปดริ้ว) → หนองคอก',
      autoCheck: 'route_type',
      expect: { routeType: 'main_route' },
      description: 'หนองคอกไม่ใช่ secondary'
    },
    {
      id: 'CK-B03',
      name: 'เส้นทาง: แปดริ้ว → คลองหาด = main_route',
      route: 'ฉะเชิงเทรา (แปดริ้ว) → คลองหาด',
      autoCheck: 'route_type',
      expect: { routeType: 'main_route' },
      description: 'คลองหาดไม่ใช่ secondary'
    },
    {
      id: 'CK-B04',
      name: 'เส้นทาง: สนามชัย → แปดริ้ว = main_route',
      route: 'ท่ารถสนามชัยเขต → ฉะเชิงเทรา',
      autoCheck: 'route_type',
      expect: { routeType: 'main_route' },
      description: 'สนามชัย→แปดริ้ว เป็น main_route'
    },
    {
      id: 'CK-B05',
      name: 'เส้นทาง: หนองคอก → แปดริ้ว = main_route',
      route: 'หนองคอก → ฉะเชิงเทรา',
      autoCheck: 'route_type',
      expect: { routeType: 'main_route' },
      description: 'หนองคอก→แปดริ้ว เป็น main_route'
    },
    {
      id: 'CK-B06',
      name: 'เส้นทาง: … → พัทยา = secondary_connection',
      route: 'สนามชัย → แปดริ้ว → พัทยา',
      autoCheck: 'route_type',
      expect: { routeType: 'secondary_connection' },
      description: 'ปลายทาง=พัทยา ต้องเป็น secondary_connection'
    },
    {
      id: 'CK-B07',
      name: 'เส้นทาง: … → ระยอง = secondary_connection',
      route: 'แปดริ้ว → ระยอง',
      autoCheck: 'route_type',
      expect: { routeType: 'secondary_connection' },
      description: 'ปลายทาง=ระยอง ต้องเป็น secondary_connection'
    },
    {
      id: 'CK-B08',
      name: 'เส้นทาง: … → เอกมัย = secondary_connection',
      route: 'สนามชัย → แปดริ้ว → เอกมัย',
      autoCheck: 'route_type',
      expect: { routeType: 'secondary_connection' },
      description: 'ปลายทาง=เอกมัย ต้องเป็น secondary_connection'
    },
    {
      id: 'CK-B09',
      name: 'เส้นทาง: … → หมอชิต = secondary_connection',
      route: 'แปดริ้ว → หมอชิต',
      autoCheck: 'route_type',
      expect: { routeType: 'secondary_connection' },
      description: 'ปลายทาง=หมอชิต ต้องเป็น secondary_connection'
    },

    // ══ กลุ่ม C: สถานะ check-in ══
    {
      id: 'CK-C01',
      name: 'ปุ่ม check-in: ต้องแสดงเมื่อโหลดตั๋วสำเร็จ',
      mockBooking: {
        code: 'BK000012',
        route: 'แปดริ้ว → สนามชัย',
        date: _getTomorrowDate(),
        time: '09:40',
        status: 'confirmed',
        name: 'Test User',
        phone: '0812345682',
        seats: 1
      },
      autoCheck: 'checkin_btn_visible',
      expect: { showCheckinBtn: true },
      description: 'เมื่อโหลดข้อมูลตั๋วสำเร็จ #checkinPanel ต้องไม่ hidden'
    },
    {
      id: 'CK-C02',
      name: 'สถานะ checked_in: ปุ่มต้อง disabled',
      mockBooking: {
        code: 'BK000013',
        route: 'สนามชัย → แปดริ้ว → พัทยา',
        date: _getTomorrowDate(),
        time: '06:20',
        status: 'checked_in',
        name: 'Test C2',
        phone: '0812345683',
        seats: 1
      },
      autoCheck: 'checkin_btn_disabled',
      expect: { checkinBtnDisabled: true },
      description: 'status=checked_in ปุ่มต้อง disabled (ห้ามเช็คอินซ้ำ)'
    },
    {
      id: 'CK-C03',
      name: 'สถานะ cancelled: ปุ่มยกเลิกต้อง disabled',
      mockBooking: {
        code: 'BK000014',
        route: 'แปดริ้ว → สนามชัย',
        date: _getTomorrowDate(),
        time: '09:40',
        status: 'cancelled',
        name: 'Test C3',
        phone: '0812345684',
        seats: 1
      },
      autoCheck: 'cancel_btn_disabled',
      expect: { cancelBtnDisabled: true },
      description: 'status=cancelled ปุ่มยกเลิกต้อง disabled'
    },
    {
      id: 'CK-C04',
      name: 'นอกรัศมี check-in: ปุ่ม check-in ต้อง disabled',
      mockBooking: {
        code: 'BK000015',
        route: 'สนามชัย → แปดริ้ว → ระยอง',
        date: _getTomorrowDate(),
        time: '06:20',
        status: 'confirmed',
        name: 'Test C4',
        phone: '0812345685',
        seats: 1
      },
      mockDistance: 999,
      autoCheck: 'checkin_btn_disabled',
      expect: { checkinBtnDisabled: true },
      description: 'อยู่นอกรัศมี 2.5กม. ปุ่มเช็คอินต้อง disabled'
    },

    // ══ กลุ่ม C2: เส้นทางหลัก ไม่ต้องส่ง LINE / ไม่ต้องต่อรถ ══
    {
      id: 'CK-C05',
      name: 'main route: แปดริ้ว → สนามชัย ไม่ต้องส่ง LINE ต่อรถ',
      mockBooking: {
        code: 'BK000016',
        route: 'แปดริ้ว → สนามชัย',
        date: _getTomorrowDate(),
        time: '09:40',
        status: 'confirmed',
        name: 'Main Route Test 1',
        phone: '0812345686',
        seats: 1
      },
      autoCheck: 'no_line_for_main',
      expect: { routeType: 'main_route', noTransferLine: true },
      description: 'เส้นทางหลักเดียวกัน ต้องไม่บังคับ check-in ต่อรถ และไม่ต้องส่ง LINE แจ้งนายท่า'
    },
    {
      id: 'CK-C06',
      name: 'main route: แปดริ้ว → หนองคอก ไม่ต้องส่ง LINE ต่อรถ',
      mockBooking: {
        code: 'BK000017',
        route: 'แปดริ้ว → หนองคอก',
        date: _getTomorrowDate(),
        time: '11:20',
        status: 'confirmed',
        name: 'Main Route Test 2',
        phone: '0812345687',
        seats: 1
      },
      autoCheck: 'no_line_for_main',
      expect: { routeType: 'main_route', noTransferLine: true },
      description: 'ปลายทางอยู่ในเส้นทางหลัก ต้องแสดงเฉพาะระยะทาง/ETA ไปปลายทางจริง ไม่ใช่สถานีต่อรถ'
    },
    {
      id: 'CK-C07',
      name: 'main route: แปดริ้ว → คลองหาด ไม่ต้องส่ง LINE ต่อรถ',
      mockBooking: {
        code: 'BK000018',
        route: 'แปดริ้ว → คลองหาด',
        date: _getTomorrowDate(),
        time: '14:00',
        status: 'confirmed',
        name: 'Main Route Test 3',
        phone: '0812345688',
        seats: 1
      },
      autoCheck: 'no_line_for_main',
      expect: { routeType: 'main_route', noTransferLine: true },
      description: 'ห้ามจัดคลองหาดเป็น secondary_connection เพราะยังอยู่ในเส้นทางหลัก'
    },

    // ══ กลุ่ม D: ต้องตรวจด้วยมือ ══
    {
      id: 'CK-D01',
      name: 'ส่ง LINE จริง: ต้องตรวจด้วยมือ',
      autoCheck: 'manual',
      manualNote: 'เปิด check_ticket.html → ค้นหาตั๋วจริง → GPS ใกล้แปดริ้ว → กดเช็คอิน → ตรวจใน LINE group ว่าได้รับข้อความ',
      expect: {}
    },
    {
      id: 'CK-D02',
      name: 'GPS + ระยะจริง: ต้องตรวจด้วยมือ',
      autoCheck: 'manual',
      manualNote: 'เปิดหน้า check_ticket.html บนมือถือ เปิด GPS จริง → ตรวจว่า distanceText, etaText อัปเดต',
      expect: {}
    },
    {
      id: 'CK-D03',
      name: 'Firebase realtime listener: ต้องตรวจด้วยมือ',
      autoCheck: 'manual',
      manualNote: 'แก้ข้อมูลใน Firebase admin → ตรวจว่าหน้าเว็บอัปเดตโดยอัตโนมัติ ไม่ต้อง refresh',
      expect: {}
    }
  ]
};

if (typeof module !== 'undefined') module.exports = TEST_CASES;
