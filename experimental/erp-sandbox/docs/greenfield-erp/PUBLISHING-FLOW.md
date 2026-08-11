# Draft, Publish and Rollback

## State Machine

    imported -> draft -> validating
    validating -> invalid -> draft
    validating -> reviewRequested -> reviewing
    reviewing -> changesRequested -> draft
    reviewing -> approved -> building -> ready -> published -> superseded
    building -> failed

Admin แก้ Draft เท่านั้น และต้องมี separation of duties ตาม policy

## Draft Command

ทุกคำสั่งมี authenticated UID, scope check, expected revision, idempotency key, reason และ bounded payload Backend เพิ่ม revision/audit ทุกครั้ง Conflict ต้องคืน revision ปัจจุบัน ห้าม last-write-wins แบบเงียบ

## Validation Gate

ตรวจ schema/type, required fields, Stable ID, foreign keys, operator scope, stop sequence, time monotonicity, calendar, Fixed/Frequency, fare, transfer และ estimated published size ผลตรวจต้อง reproducible ด้วย schemaVersion และ validatorVersion

## Phase 1: Build Immutable Version

1. สร้าง versionId และ manifest สถานะ building
2. สร้าง Read Model
3. เขียนทีละ chunk ภายใต้ internal limit
4. เก็บ checksum/count ต่อ chunk
5. อ่านกลับแบบ bounded verification
6. ตรวจ cross-entity integrity
7. เปลี่ยน manifest เป็น ready

หากล้มเหลว Current Pointer ไม่เปลี่ยน และ version ถูกทำเครื่องหมาย failed

## Phase 2: Atomic Pointer Switch

Atomic update เฉพาะข้อมูลขนาดเล็ก:

    publishedReadModels/current
    data/erpDataCenter/publication/history/{versionId}
    data/erpDataCenter/audit/events/{eventId}

Pointer เปลี่ยนได้เมื่อ manifest ready, checksum ถูกต้อง และ approval ยังมีผล

## Consumer Protocol

1. อ่าน current
2. จับ versionId ตลอด request
3. อ่านเฉพาะ node ใต้ version นั้น
4. ตรวจ schema/manifest
5. ไม่ผสมข้อมูลข้าม version
6. เมื่อ Pointer เปลี่ยน ให้จบรอบเดิมแล้วโหลดใหม่

หากโหลดไม่ได้ ใช้ last-known-good ตาม TTL และแจ้งระบบ ห้าม fallback ไป Draft

## Journey Cache

Cache key คือ versionId ร่วมกับ network partition ใช้ global/module scope เพื่อ reuse แต่ทุก request ต้องตรวจ version และ reload ได้เอง Pointer event ใช้ warm/invalidate ได้แต่ห้ามถือว่า broadcast ถึงทุก instance เริ่ม minInstances เป็น 0 จนกว่าจะมีผลวัดและอนุมัติค่าใช้จ่าย

## Rollback

Owner เลือก last-known-good version จากนั้น Backend ตรวจ manifest แล้ว atomic switch pointer กลับ บันทึก history/audit และให้ consumer/cache reload ห้ามแก้เนื้อหา version เก่า

## Idempotency

Publish request เดิมคืน version เดิม, chunk retry เขียน path/checksum เดิม, pointer switch ซ้ำไม่มีผลข้างเคียงซ้ำ และ trigger รองรับ at-least-once delivery