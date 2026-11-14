# ย้าย S.L.Transit จากเว็บมาจองในแชท LINE

วันที่ตรวจ: 2 พฤศจิกายน 2569 (Asia/Bangkok)
สถานะ: ฉบับร่างส่วนแรก ไม่ใช่ระบบรับจองพร้อมใช้

## เป้าหมายที่ผู้ใช้ยืนยัน

ผู้โดยสารจองผ่านข้อความและปุ่มในห้องแชท @420lzred จนครบ ไม่พาไปเว็บเพื่อทำรายการจอง และไม่สร้าง LIFF เป็นทางเลือกหลักในงานนี้ เว็บและหลังบ้านเดิมคงใช้งานระหว่างย้าย ส่วน staff S.L.Transit (@747uxelm) ใช้แจ้งคนขับและต้องคงไว้

## หลักฐานระบบปัจจุบัน

- โค้ดอ้างอิง: SL-Transit/bus main, commit 4fa94751da4ba75f8bba216c1e8171a8df322196
- GitHub Pages run 33042101860 (สำเร็จ) เผยแพร่ main; CNAME = sl-transit.com
- booking1.html ตั้ง Firebase project เป็น sl-transit-9464e
- booking-bridge.js เรียก reserveBookingCapacity และ createBooking ใน asia-southeast1/sl-transit-9464e
- ตรวจ Cloud Run processNotificationJob ใน sl-transit แล้วพบการแยก tokenKind/channelKind ของ passenger กับ staff และ secret คนละชื่อ โดยไม่ได้อ่านค่าลับหรือทดสอบส่งจริง
- bus-booking-1d68c ยังมี sendLineOnBooking, sendLineOnPaymentVerified, verifySlip รุ่นเดิม การมีฟังก์ชันอยู่ไม่ใช่หลักฐานว่าเว็บปัจจุบันเรียกใช้ ห้ามปิดหรือลบ
- OA ผู้โดยสารมี Messaging API เปิดแล้ว แต่ Webhook ปิด และ URL เดิมเป็น https://sl-transit.com/ ไม่ใช่หลักฐานว่ามีตัวรับแชท
- Rich Menu เดิมยังเชื่อมหน้าเว็บ booking.html, passenger.html, check_ticket.html และไม่เปลี่ยนในงานนี้
- ซอร์ส Functions ที่ติดตั้งจริงบางส่วนต่างจาก main ต้องทำ deployment diff ก่อน integration ไม่ใช้ main แทนหลักฐาน deployment
- ค่า bookingProductionReady=false และ Rules bookings ที่เปิดอ่าน/เขียนซึ่งตรวจพบก่อนหน้าเป็นของ bus-booking ห้ามสรุปว่าเป็นสถานะของ sl-transit

## สิ่งที่ฉบับร่างนี้ทำ

functions/line-passenger-webhook.js เป็นฟังก์ชันบริสุทธิ์สำหรับตรวจคำขอและสร้าง command preview ไม่มี HTTP endpoint ที่ deploy ได้ ไม่มี Firebase/network/logging/LINE reply หรือ booking write และไม่เพิ่ม export ใน functions/index.js

- ค่าเริ่มต้นปิด ต้องระบุ enabled=true, channelId ของผู้โดยสาร, secret, bot user ID และรายชื่อผู้ทดสอบ 1–20 คน
- ตรวจ HMAC-SHA256 จาก rawBody เดิมก่อนแปลง JSON โดยเทียบแบบ timing-safe
- ตรวจ destination และรับเฉพาะแชทส่วนตัวในรายชื่อทดสอบที่อยู่โหมด active
- จำกัด body 256 KiB และ 20 events ต่อคำขอ; แยกคำสั่งจากปุ่ม/คำไทยที่กำหนดไว้
- ตัด event ซ้ำเฉพาะภายในคำขอเดียว ยังไม่มีการกัน replay ข้ามคำขอ
- ผล commands มี user ID และ reply token เป็นข้อมูลส่วนตัว ห้ามส่งออกเป็น HTTP body หรือ log; HTTP wrapper อนาคตส่งได้เฉพาะ publicBody
- ยังไม่อ่านตารางรถ ยังไม่มี durable session/published-data/booking/payment adapter และยังไม่ตอบผู้ใช้จริง

การทดสอบ: node --test tests/line-passenger-webhook.test.js
ชุดทดสอบใช้ข้อมูลจำลอง 20 กรณี ไม่มีข้อมูลผู้โดยสารหรือ credential จริง ทดสอบชุดเดียวกันในหน่วยความจำแล้วผ่าน 20/20 โดยไม่ใช้ไฟล์ในเครื่อง แต่ยังไม่ใช่ Emulator หรือ end-to-end proof

## ขั้นตอนแชทที่จะพัฒนาต่อ

1. กด/พิมพ์ จองตั๋ว แล้วเลือกต้นทางจากข้อมูลที่เผยแพร่
2. เลือกปลายทางที่มีเส้นทางให้บริการจริง
3. เลือกวันเดินทางโดยยึด Asia/Bangkok
4. ระบบแสดงเที่ยวที่จองได้ พร้อมราคา จุดขึ้นรถ การต่อรถ และที่นั่งจากหลังบ้าน
5. เลือกจำนวนผู้โดยสาร และกรอกชื่อ/โทรศัพท์ในแชทส่วนตัว
6. แสดงสรุปและขอความยินยอมที่จำเป็นก่อนยืนยัน
7. ยืนยันผ่าน trusted booking boundary เดิม ซึ่งตรวจเวลา ราคา version และที่นั่งซ้ำบนเซิร์ฟเวอร์
8. เลือกการชำระเงินตามนโยบายที่หลังบ้านอนุญาต โอนแล้วส่งรูปสลิปในแชทได้เมื่อ payment adapter ผ่านการทดสอบ
9. สถานะชำระเงินสำเร็จต้องมาจากผลตรวจจริง ไม่ถือว่ารับรูปแล้วเท่ากับจ่ายสำเร็จ
10. รับตั๋วและเรียกดูการจองของฉันจากบัญชี LINE ที่เป็นเจ้าของรายการเท่านั้น

ทุกขั้นตอนมี ย้อนกลับ, ยกเลิกขั้นตอน และ ติดต่อเจ้าหน้าที่; ยกเลิกขั้นตอนแชทต้องไม่ยกเลิกตั๋วจริงโดยอัตโนมัติ

## สัญญาการเชื่อมต่อและงานที่ยังต้องทำ

### ตัวรับและสถานะแชท

- เพิ่ม HTTP wrapper แยกของ passenger channel หลัง review เท่านั้น ห้ามใช้ URL ฟังก์ชันส่งแจ้งคนขับเป็น Webhook
- verified event ต้องถูก claim แบบ atomic ใน private durable inbox โดยใช้ channel ID + webhookEventId ไม่ใช้ Map ใน memory เป็นตัวกันซ้ำ
- durable session ต้องมี revision, state, expiry และ process แบบเรียงต่อผู้ใช้ เพื่อกันกดปุ่มซ้ำ/สลับลำดับ; ไม่เชื่อ postback ราคา user ID หรือ booking owner ที่ลูกค้าส่งมา
- durable inbox/outbox ต้องกำหนด retry, lease, fencing, retention และพิสูจน์กรณีส่ง reply สำเร็จแต่บันทึกผลล้มเหลว; ยังไม่มีในฉบับนี้
- รายชื่อผู้ทดสอบใช้ LINE user ID ฝั่ง server ไม่เก็บใน GitHub; ไม่เปิดโหมดรับทุกคนระหว่าง pilot
- ไม่บันทึก raw webhook, reply token, ข้อความส่วนตัว หรือ secret ลง log; กำหนด retention และลบ draft session ตามนโยบาย

### เส้นทาง ราคา และที่นั่ง

- ใช้ published journey/read contract ที่มีอยู่พร้อม pin publicationVersion ไม่สร้าง Journey Engine/Schema หรือคัดตารางรถซ้ำ
- แยก reusable trusted booking service จาก logic เดิมก่อนใช้กับ LINE ต้องมี trusted identity mapping ที่ตรวจได้ ไม่ปลอม Firebase bearer token และไม่เชื่อ LINE user ID จาก client
- รักษาสัญญา ownerUid, booking code, canonical trip identity, fare snapshot, capacity และ notificationPreference ของระบบเดิม
- จองพร้อมกันจากเว็บและ LINE ต้องใช้ counter/transaction เดียวกัน มี idempotency, expiry/release และชดเชยเมื่อกันที่นั่งแล้วบันทึกไม่สำเร็จ
- main createBooking กับ capacity reservation เป็นคนละขั้น ต้องพิสูจน์ความสัมพันธ์และการคืนที่นั่งก่อนนำมาใช้จริง ไม่เรียกสร้าง booking โดยข้าม capacity gate
- เงื่อนไขหมดเวลา ปิดเที่ยว วันให้บริการ และราคาที่เปลี่ยนต้อง fail closed หรือขอยืนยันใหม่ ไม่เดาราคา/เวลา

### การชำระเงินและการแจ้งเตือน

- ต้องตรวจ payment runtime ที่ใช้จริงใน sl-transit และเจ้าของการรับชำระก่อนเชื่อม เพราะ verifySlip ที่พบใน bus-booking อาจเขียนคนละฐานข้อมูล
- ห้ามนำสลิปจาก LINE ส่งไปบริการอื่นหรือแก้สถานะการเงินจริงก่อนมีขอบเขตการอนุมัติและการทดสอบที่ชัดเจน
- reuse notificationJobs/processNotificationJob เดิมสำหรับ staff และ passenger ไม่ส่ง staff alert ซ้ำจาก webhook
- ต้องตรวจระบบทดสอบ/พักแจ้งเตือนและ routing คนขับที่ใช้งานจริง โดยไม่เปลี่ยนค่าระหว่างตรวจ
- ตรวจสิทธิ์อ่านการจองจาก verified channel+user identity; รหัสตั๋วหรือเบอร์โทรอย่างเดียวไม่เพียงพอ

## เกณฑ์ก่อนเปิดให้ทดสอบและเปิดจริง

- deployment/source reconciliation, published source readiness, privacy/Rules review สำหรับ path ใหม่
- Emulator: ปุ่มซ้ำ, replay, event สลับลำดับ, session หมดอายุ, จองข้ามบัญชี, ราคาเปลี่ยน, เที่ยวปิด, เวลาไทย, ที่นั่งสุดท้ายพร้อมกันจากเว็บ/LINE, reserve แล้ว create ล้มเหลว, cancel/release
- Payment: สลิปผิดยอด/ผิดผู้รับ/ซ้ำ/ตรวจไม่ได้ และไม่มีการยืนยันเงินจากข้อความผู้ใช้
- Staff: แจ้งเฉพาะคนขับที่ถูกต้องและไม่ซ้ำ; เว็บเดิมยังจอง/ตรวจตั๋ว/แจ้งเตือนได้
- กำหนด maxInstances, concurrency, timeout, rate limit, retention และค่าใช้จ่ายตามผลทดสอบก่อน deploy; ไม่มี production load proof ในฉบับนี้
- Owner review แยกก่อน merge/deploy, เชื่อม secret, เปิด Webhook, ส่งข้อความทดสอบจริง และเผยแพร่ Rich Menu ตามขอบเขตที่อนุมัติ
- Rollback: ปิดเฉพาะตัวรับแชทใหม่และคืนเมนูเดิมตามแผนที่อนุมัติ ไม่ปิด staff bot/เว็บ ไม่ลบ booking/ธุรกรรม และต้องติดตาม booking ที่รับไปแล้วจนจบ

## เอกสารอ้างอิง

- https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
- https://developers.line.biz/en/docs/messaging-api/receiving-messages/
- https://github.com/SL-Transit/bus/actions/runs/33042101860
- ai-handoffs/SYSTEM-DIRECTION.md และ DECISION-LOG.md ใน main


## ความคืบหน้าขั้นตอนสนทนา — 2 พฤศจิกายน 2569

เพิ่ม functions/line-booking-conversation.js และ tests/line-booking-conversation.test.js เป็น pure reducer กับตัวสร้างข้อความ Quick Reply สำหรับแชทส่วนตัว ไม่มี Firebase export, database access หรือ network

- เลือกต้นทาง ปลายทาง วันเดินทาง เที่ยว และจำนวนคน ผ่านตัวเลือกที่ trusted adapter ส่งมา ไม่คำนวณเส้นทาง/ราคาหรือสร้างข้อมูลขนส่งซ้ำ
- รับชื่อและโทรศัพท์ ตรวจรูปแบบ และยอมรับเฉพาะเงื่อนไขฉบับที่ trusted adapter แสดงผ่าน applyTerms เท่านั้น ไม่รับ termsVersion จากลูกค้า
- ผูกการเลือกกับ private session owner, revision และ opaque token; แบ่งตัวเลือกครั้งละ 8 รายการ และจำกัดจำนวนปุ่ม/ความยาวปุ่ม
- ตรวจ publicationVersion, วันเดินทางตาม Asia/Bangkok, quote expiry/currency/จำนวนคน และราคาจำนวนเต็มหน่วยสตางค์
- แสดงสรุปเส้นทาง วัน เที่ยว จำนวนคน ชื่อ/โทร และยอดรวมจาก trusted quote ก่อนยืนยัน
- ยืนยันแล้วได้ effect confirm_existing_booking เท่านั้น ต้องเชื่อมบริการเดิมที่กันที่นั่งและบันทึกอย่างมี idempotency ต่อ ไม่ถือว่า effect เท่ากับจองสำเร็จ
- รับผลจองผ่าน applyReceipt เฉพาะจาก trusted adapter ที่ตรง requestId และเจ้าของ session; ภาพสลิปไม่ใช่หลักฐานชำระสำเร็จ
- ข้อความที่สร้างมีป้ายตัวอย่างทดสอบเป็นค่าเริ่มต้น ไม่มีการส่งจริง

ผลทดสอบ: webhook 25 กรณี + conversation/renderer 25 กรณี = 50/50 ผ่านจากโค้ดอ่านกลับจาก GitHub แล้วรันในหน่วยความจำ ไม่มีไฟล์ในเครื่อง ไม่มีข้อมูลจริง และยังไม่ใช่ Emulator/end-to-end proof

ข้อจำกัดที่ยังมี: ไม่มี HTTP wrapper, durable inbox/session/CAS/outbox, private actor mapping, published view/quote/booking adapter, การตรวจสลิป หรือการเชื่อมข้อมูลจริง ปุ่มย้อนกลับ/เริ่มใหม่และการส่งต่อเจ้าหน้าที่ยังต้องเติมใน orchestrator การกันข้อความซ้ำข้ามคำขอและการจองพร้อมกันต้องพิสูจน์ใน Emulator ก่อนใช้งานจริง

คำสั่ง inputText, ชื่อ/โทรใน session, ข้อความ review และผล toLineMessages เป็นข้อมูลส่วนตัวสำหรับแชทผู้โดยสารคนเดิมเท่านั้น ไม่ใช่ HTTP response/logging contract การรับข้อความตัวอักษรต้องถูกเติม current revision หลัง claim event และโหลด session จาก private actor mapping ไม่เชื่อ revision/actor จากลูกค้า


## ความคืบหน้าการเก็บสถานะ — 3 พฤศจิกายน 2569

เพิ่ม functions/line-booking-store.js เป็นโมดูล draft ที่รับ Admin RTDB ผ่าน dependency injection เท่านั้น ไม่เริ่ม Firebase เอง ไม่ export endpoint และยังไม่เชื่อม conversation/webhook หรือ sender จริง

- บันทึก inbox marker, session revision และ outbox job ใน transaction เดียวต่อผู้ใช้; path แยก passenger channel 2010730849 และ hash actor ไม่ใช้ LINE user ID เป็นชื่อ path
- duplicate event ไม่เรียก reducer ซ้ำ; event ID เดิมแต่เนื้อหาเปลี่ยนถูกปฏิเสธ; revision เก่าหรือเวลา event ย้อนกลับไม่เขียนทับขั้นตอนใหม่
- reducer ต้อง pure เพราะ transaction อาจเรียกหลายครั้ง; external booking/LINE calls ต้องอยู่นอก callback และต้องใช้ idempotency ของบริการเดิม
- โหลด cache จาก path เดียวก่อน transaction เพื่อไม่ตีความ null จาก cold cache ว่าไม่มีข้อมูล; การตัดสินใจและ write ยังอยู่ใน transaction
- marker 24 ชั่วโมง สูงสุด 128 รายการต่อ actor; command 4 KiB, session 32 KiB, outbox payload 16 KiB และ actor transaction 64 KiB; outbox ค้างสูงสุด 16 งานแล้วพักรับเพิ่ม ไม่มีการทิ้งงานค้างเพื่อเปิดทางให้ replay
- worker claim มี token และ lease 1–60 วินาที; acknowledgement ต้องตรง worker/token และยังไม่หมดเวลา; สำเร็จแล้วลบ private payload ออกจาก job
- งาน processing หมดเวลาเปลี่ยนเป็น needs_reconciliation โดยไม่ส่งซ้ำอัตโนมัติ ต้องตรวจผล booking ตาม idempotency key/สถานะ reply ก่อนตัดสินใจ งานนี้ยังไม่มีตัว reconciliation หรือ sender
- inbox pruning ทำเฉพาะ marker หมดอายุและปฏิเสธ envelope เก่า; delivered outbox ถูกเก็บกวาดใน event ถัดไป งานที่ไม่สำเร็จไม่ถูกลบอัตโนมัติ

ไฟล์ Emulator ปฏิเสธทุก target ยกเว้น demo-sl-transit-line + 127.0.0.1:9000 ก่อนโหลด Admin SDK ใช้ deny-all Rules เฉพาะ fixture; ไม่แก้ database.rules.json ของระบบจริง Workflow ใหม่ใช้ contents:read และไม่มี credentials หรือ deploy step

หลักฐาน CI จะบันทึกในรายงาน Work Board หลังตรวจผลครบ: unit ครอบคลุม replay/ownership/revision/backpressure/fencing; Emulator ตรวจ concurrent duplicate 20 ครั้ง, revision race 20 ครั้ง, worker race 10 ครั้ง, acknowledgement, denial และ persistence ข้าม store instance

ข้อจำกัดก่อนใช้จริง: ยังไม่มี persistent event processor ที่เชื่อม pure conversation กับ store, trusted actor-to-booking identity mapping, published/quote/booking adapter, sender, automated reconciliation หรือ session/PII retention cleanup; schema นี้ไม่ใช่ transport schema และไม่คำนวณที่นั่ง/ราคา การเก็บสถานะได้ไม่รับประกัน exactly-once ของบริการภายนอก ต้องพิสูจน์ crash-after-booking และ crash-after-send ก่อนเปิด pilot

ข้อมูลผลทดสอบในหัวข้อก่อนหน้าเป็นหลักฐานของขั้นตอนนั้น ณ วันที่ระบุ ไม่ใช่สถานะ integration ล่าสุด ยังไม่ merge/deploy หรือเปิด webhook และไม่ได้ส่งข้อความจริง


## ความคืบหน้าตัวประมวลผลจำลอง — 3 พฤศจิกายน 2569

เพิ่ม functions/line-booking-processor.js เชื่อม signed webhook -> pure conversation -> private durable store -> simulation worker เป็นฉบับร่าง ปิดเป็นค่าเริ่มต้นและรับเฉพาะ adapter ที่ระบุ mode simulation ไม่มี Firebase initialization, HTTP export, index.js wiring, sender หรือ production adapter

1. ตรวจ raw-body signature, passenger destination, private cohort และ signed event timestamp ก่อนอ่าน session; timestamp ต้องเป็นจำนวนเต็มไม่ติดลบ และ durable store ตรวจช่วงอายุ/ลำดับอีกชั้น
2. แยก runtime envelope revision (CAS ต่อ event) จาก conversation revision (ปุ่ม/สถานะ) เพื่อรองรับการโหลดตัวเลือก/ใบเสนอราคาที่มี revision ของตนเอง คืนค่า selection/choices ว่างที่ RTDB ไม่เก็บ ก่อนเข้า pure reducer
3. Read adapters สำหรับตัวเลือก/เงื่อนไข/quote ทำงานก่อน transaction แล้ว commit ด้วย revision ที่อ่านมาเท่านั้น หากชนกันไม่ตีความข้อความเดิมใหม่เป็นคำตอบขั้นถัดไป; ไม่มี service call ใน transaction callback
4. เริ่มใหม่ได้เมื่อยกเลิก/จบ/หมดอายุ โดย conversation revision เพิ่มต่อเนื่องและ session ID เปลี่ยน ปุ่มจาก session เก่าจึงใช้กับ session ใหม่ไม่ได้
5. ยืนยันแล้วเก็บ submitting + outbox ก่อนเรียกบริการจองจำลอง worker claim งานก่อนเรียก service นอก transaction และส่ง requestId เดิมเป็น idempotency key ไม่ใช้ LINE user ID แทน Firebase bearer token
6. รับ synthetic receipt ที่ตรง requestId/actor แล้วเขียน complete + completion preview แบบ atomic ก่อน acknowledgement ของงานเดิม ไม่ถือว่ากดปุ่มแล้วเท่ากับจองสำเร็จ และไม่ถือว่ารับภาพสลิปแล้วเท่ากับชำระเงิน
7. ถ้าบริการ/DB ล้มเหลวหลังเริ่มงาน หรือ lease หมด ไม่เรียกจองซ้ำอัตโนมัติ งานจะรอ reconciliation และยังไม่แสดง complete ถ้ายังไม่มี receipt ที่บันทึกสำเร็จ
8. runSimulationJob คืนข้อความ preview เป็นข้อมูลส่วนตัวให้ชุดทดสอบเท่านั้น ไม่มีการส่งไป LINE และไม่เก็บ reply token ใน durable state; HTTP wrapper อนาคตส่งได้เฉพาะ publicBody ห้ามคืน privateResults/messages

ชุดทดสอบเพิ่ม: บทสนทนา signed ตั้งแต่เริ่มจน receipt, duplicate ที่ reply token เปลี่ยน, CAS ของข้อความชื่อพร้อมกัน, restart/ปุ่มเก่า, signature/cohort, adapter failure, wrong-owner receipt, crash หลังบริการจองจำลอง commit และ privacy; Emulator ใช้ RTDB จริงใน demo project เดิมและสร้าง processor ใหม่ระหว่างคำขอ พร้อม worker 10 ตัวแย่งงานยืนยัน

ผล CI และ commit ที่ตรวจผ่านดู review report ล่าสุดใน WORK-BOARD และ PR #187 ข้อมูลทดสอบเป็น fixture เท่านั้น ไม่ใช่หลักฐานเชื่อมระบบจอง/ที่นั่ง/ชำระเงินจริง

งานที่ยังต้องทำก่อน pilot: ตรวจ deployed/main source ให้ตรงกันและ reuse trusted booking/capacity authority เดิม, mapping เจ้าของตั๋วที่ยืนยันได้, real published/terms/quote adapter, ordered dispatcher ที่จัดการ conflict ให้ผู้ใช้, sender และ crash/reply reconciliation, cleanup PII/session, ย้อนกลับ/UX เริ่มใหม่/ส่งต่อเจ้าหน้าที่/ค้นตั๋วจริง และการทดสอบที่นั่งสุดท้ายร่วมกับเว็บ ไม่มีการแก้ Production, Rich Menu, webhook หรือ staff notification เดิมในขั้นนี้


## ตรวจซอร์สที่ deploy และแยกบริการจองร่วม — 3 พฤศจิกายน 2569

ตรวจแบบอ่านอย่างเดียวใน Cloud Console โครงการ sl-transit-9464e โดยเปิด Source และ Revision History ไม่กด Test/Edit/Redeploy ไม่เรียก endpoint และไม่อ่านข้อมูลผู้โดยสาร เทียบข้อความจากตัวแสดงโค้ดกับ GitHub main 4fa94751da4ba75f8bba216c1e8171a8df322196 ในหน่วยความจำโดยปรับ CRLF เป็น LF และไม่นับ newline ท้ายไฟล์ที่ปุ่ม Copy raw file ตัดออก ตรวจการคัดลอกใหม่ด้วย sentinel ก่อนเทียบ ไม่มีการดาวน์โหลดหรือใช้ไฟล์ในเครื่อง

| บริการ | revision รับ traffic 100% | ผลเทียบ |
| --- | --- | --- |
| createBooking | createbooking-00009-yol (15 ส.ค. 2569) | index.js ทั้งไฟล์และ booking-time-authority.js ตรง main ทุกบรรทัด |
| reserveBookingCapacity | reservebookingcapacity-00009-nih (12 ส.ค. 2569) | handler กันที่นั่ง, requireUserToken/path validation, canonical reader/readiness และ resolvePublishedCapacity ที่ใช้จริงตรง main; bundle ทั้งไฟล์ต่างเพราะมี helper สร้างรายการรุ่นเก่าที่ฟังก์ชันนี้ไม่ได้ใช้ |
| cancelBooking | cancelbooking-00003-soj (9 ส.ค. 2569) | handler ยกเลิก, rate/phone/departure guards และ releaseBookingCapacityServer ตรง main; bundle ทั้งไฟล์ต่างรุ่น |

ผลนี้แก้ความเข้าใจเดิมให้เจาะจง: ความต่างใน source bundle ของ notification function ไม่ใช่หลักฐานว่า createBooking ที่ใช้งานจริงเก่า ต้องเทียบเฉพาะบริการและ dependency ที่รับ traffic จริง ห้ามแก้โดย deploy ทุกฟังก์ชันทับพร้อมกัน

จุดอ้างอิง Cloud Console (ต้องใช้บัญชีโครงการที่มีสิทธิ์):
- https://console.cloud.google.com/run/detail/asia-southeast1/createbooking/source?authuser=2&project=sl-transit-9464e
- https://console.cloud.google.com/run/detail/asia-southeast1/reservebookingcapacity/source?authuser=2&project=sl-transit-9464e
- https://console.cloud.google.com/run/detail/asia-southeast1/cancelbooking/source?authuser=2&project=sl-transit-9464e

### บริการร่วมในสาขาร่าง

เพิ่ม functions/booking-authority-service.js แล้วย้าย reserve/create business logic เดิมออกจาก HTTP callback มาไว้ที่เดียว functions/index.js ยังคง endpoint เดิมและตรวจ method/CORS/Firebase ID token ก่อนส่ง ownerUid ที่ verify แล้วเข้า service ไม่ใช้ LINE user ID แทน Firebase token

- service รับ database และ authority helpers เดิมผ่าน dependency injection ไม่ initialize Firebase หรือเปิด HTTP เอง ไม่มี LINE adapter
- ใช้ counter path เดิม operations/bookingCapacityByServiceDate, owner-bound reserve/release, server capacity limit และ booking transaction เดิม
- ใช้ canonical pair/source, authoritative price/time, payment mapping และ booking snapshot เดิม ไม่สร้างเครื่องคิดราคา/เส้นทางหรือข้อมูลขนส่งซ้ำ
- คงลำดับตรวจ system test mode ก่อนแปลง input ด้วย private synchronous readInput; HTTP status/body/error handling เดิม
- โค้ด index.js นอก handler reserve/create และการนำเข้า/สร้าง service เทียบแล้วไม่เปลี่ยน; cancel/notification/driver functions ไม่แก้
- ปรับ source-location assertions ใน regression tests ให้ตรวจ module ที่ย้ายไป โดยคงเงื่อนไขด้านราคา/เวลา/owner/counter/Auth ไว้ และเพิ่ม behavioral service tests 7 กรณี

Emulator เพิ่มการเรียกบริการร่วม 2 instance ที่ติดป้าย web/LINE ในชุดทดสอบ ส่งพร้อมกัน 20 คำขอเข้าหนึ่ง counter 3 ที่นั่ง ปฏิเสธ client limit 999, คืนที่นั่งข้ามเจ้าของไม่ได้ และคืนซ้ำไม่ลดยอดเกินจริง นี่เป็น service-level proof กับ RTDB จำลอง ไม่ใช่ proof ว่า LINE หรือเว็บไซต์ Production เชื่อมบริการรุ่นใหม่นี้แล้ว การเรียก HTTP จริงของสาขาร่างต้องผ่าน regression Emulator เดิมด้วย

### เกณฑ์ที่ยังต้องปิดก่อน live adapter

การแยกโมดูลนี้รักษาพฤติกรรมเดิม ยังไม่ทำให้ reserve+create เป็น transaction เดียว createBooking เดิมไม่ตรวจหลักฐานจองที่นั่งที่ผูก owner/จำนวน/เที่ยว และ browser preview adapter คืนที่นั่งเมื่อ create ล้มเหลวทุกชนิด ซึ่งอาจเป็นผลตอบกลับสูญหายหลังบันทึกสำเร็จได้ ต้องมี durable command/recovery และตรวจผล booking ตาม requestId ก่อนตัดสินใจคืนที่นั่ง ไม่ใช้ blind retry หรือ blind release

LINE ต้องได้ trusted identity mapping ไปเจ้าของตั๋ว, server-derived capacity key ที่ผูก canonical trip และ publicationVersion, reservation binding/expiry/compensation, approved terms/quote จาก published contract, sender/reconciliation และ cleanup PII ก่อนเปิด pilot ห้ามนำ service ที่รับ trusted ownerUid ไปเปิดเป็น endpoint รับ ownerUid จาก client โดยตรง Current real booking validation ยังอ่าน canonical workbookSource ผ่าน server helper เดิม; ยังไม่ใช่ published consumer adapter ของ LINE

ไม่มี Firebase/Rules deploy, main merge, production write/booking/payment/LINE send หรือการเปลี่ยน staff notification, Rich Menu และ webhook ในขั้นนี้ ข้อกำหนด production review/approval และ rollback ยังใช้ตามเดิม ผล CI และ commit ล่าสุดดู Work Board/PR #187


## การกันที่นั่งและกู้คืนคำสั่งจอง LINE (ฉบับร่าง)

บริการฝั่งเซิร์ฟเวอร์ใช้ข้อมูลเที่ยวและราคาเดียวกับเว็บ สร้างรหัสจองเดิมสำหรับคำสั่งเดิม และตรวจว่าที่นั่งที่กันไว้ตรงกับเจ้าของ เที่ยว และจำนวนผู้โดยสารก่อนสร้างรายการจอง หากการตอบกลับหาย ระบบตรวจรายการเดิมก่อนลองใหม่และกันที่นั่งไว้ระหว่างตรวจสอบ การกันที่นั่งกับการเขียนรายการจองอยู่คนละธุรกรรม หลังครบจำนวนครั้งที่กำหนด (ค่าเริ่มต้น 5 ครั้ง) ต้องให้ผู้ดูแลตรวจสอบและจัดการที่นั่งค้าง

ทดสอบกับ Firebase จำลองแล้ว คำสั่งซ้ำ 20 ครั้งสร้างรายการเดียวและกันที่นั่งเพียงครั้งเดียว กรณีผลตอบกลับจากการกันที่นั่งหรือการสร้างรายการหายใช้ข้อมูลเดิมต่อได้ ชุดทดสอบระบบเดิมผ่านด้วย ดู [ผลทดสอบ LINE](https://github.com/SL-Transit/bus/actions/runs/41591007874) และ [ผลตรวจระบบเดิม](https://github.com/SL-Transit/bus/actions/runs/41591007808)

บริการนี้ปิดตามค่าเริ่มต้นและยังไม่ได้เชื่อมเข้ากับ webhook หรือการตอบแชทจริง ส่วน HTTP เดิมยังใช้เส้นทางเดิม ก่อนทดลองกับผู้โดยสารต้องเชื่อมตัวตนและข้อมูลเที่ยวจริง ทดสอบการส่งข้อความ และเตรียมขั้นตอนตรวจรายการค้างกับนโยบายเก็บข้อมูล
