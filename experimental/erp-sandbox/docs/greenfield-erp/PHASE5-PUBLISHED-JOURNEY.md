# Phase 5 — Published Read Model and Network Journey

## ผลลัพธ์ที่ออกแบบ

ข้อมูลจาก Draft ที่ผ่าน Approval ถูกแปลงเป็น Read Model ตาม query แล้วเขียนลง `publishedReadModels/versions/{versionId}` ทีละ chunk. ทุก chunk มี byte count, leaf-path count และ SHA-256. Current pointer จะไม่เปลี่ยนจน manifest เป็น `ready`.

การสลับ version ใช้ multi-location update ขนาดเล็กเพียง 3 ตำแหน่ง:

1. `publishedReadModels/current`
2. `data/erpDataCenter/publication/history/{eventId}`
3. `data/erpDataCenter/audit/events/{eventId}`

Version payload ไม่อยู่ใน atomic switch จึงไม่ชนข้อจำกัด 20 MB/80,000 paths. Operational chunk จำกัด 4 MB/4,500 leaf paths เพื่อเหลือพื้นที่จากเพดานภายใน 5 MB/5,000 paths.

## Hybrid journey

- Fixed Schedule ใช้ departure/arrival ของ stopTimes จริง
- Frequency/Queue ใช้ service window, headway และ expected wait = headway / 2
- Transfer ข้ามบริษัทต้องมี transfer rule ที่ location/Hub; ไม่มี rule คือไม่เสนอทางต่อ
- Fare เลือกจาก Published fare rule; ถ้าไม่ครบให้ผล `fareStatus = incomplete` แทนการเดา
- เวลาเดินทางรายช่วงของ Frequency ยังไม่มีใน Data Contract v1 จึงรับเป็น routing supplement ที่ต้องผ่านการอนุมัติ; ขาดค่าใดจะหยุด Publication

## Cache และ latency

Function instance ต้องสร้าง cache ใน module/global scope. Cache key คือ versionId. ทุก request ตรวจ current pointer ขนาดเล็ก; ถ้า version เปลี่ยนจะโหลด graph ใหม่. Event invalidation ใช้เพื่อ warm cache แต่ request-time check ยังเป็นตัว self-heal เพราะไม่มีการรับประกันว่า event จะถึงทุก instance.

## Safety และค่าใช้จ่าย

- Demo project + Emulator เท่านั้น
- ไม่อ่าน RTDB root; root ใช้เฉพาะ atomic update 3 ตำแหน่ง
- Verification อ่านเป็น batch concurrency จำกัด
- Journey จำกัดจำนวน state ต่อ request
- min/max instances, rate limit และ Production retention ยังต้องวัดและขอ Owner approval
- ไม่มี Firebase deploy, Rules deploy, seed, Production write หรือ Consumer cutoverใน PR นี้
## Hybrid transfer matching

Journey Engine จับคู่กฎตามลำดับ `location → operator → service mode → optional service id → transfer window` โดยคำนวณจาก Published Read Model ในหน่วยความจำเท่านั้น รองรับ Fixed → Frequency, Frequency → Fixed และ Frequency → Frequency และจะปฏิเสธการต่อรถเมื่อ Service ID แบบเจาะจงไม่ตรงกับบริการจริง