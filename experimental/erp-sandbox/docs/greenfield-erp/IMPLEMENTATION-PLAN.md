# Greenfield Implementation Plan

ทุก Phase ใช้ branch/PR แยก มีผลทดสอบ ผลกระทบค่าใช้จ่าย แผนย้อนกลับ และ Owner approval ก่อน merge/deploy

## Phase 0 — Architecture Contract

เอกสารชุดนี้เท่านั้น ไม่มี runtime/Firebase change

## Phase 1 — Executable Data Contract

สร้าง versioned schemas, Excel mapping, Stable ID rules, fixtures และ contract tests ยังไม่เชื่อม Firebaseและไม่แก้ admin-erp1.html

Gate: Owner อนุมัติ entity, field และ mapping

## Phase 2 — Emulator-only Import and Draft

สร้าง Import parser, Validator, Draft command service, Rules draft และ Emulator tests ใช้ Firebase demo project และ fail หากชี้ project จริง

Gate: Owner ตรวจ validation report, Rules matrix และ estimated cost

## Phase 3 — Admin ERP1 Greenfield UI

สร้าง admin-erp1.html ใหม่เป็น client ของ Command API สำหรับ Import, Draft, Validation, Diff, Review และ Approval ไม่มี direct privileged RTDB write และไม่ใช้ legacy module เว้นแต่ผ่าน audit/อนุมัติรายไฟล์

Gate: UI acceptance และ authorization tests

## Phase 4 — Publication and Read Model

สร้าง version builder, chunk writer, manifest/checksum, atomic pointer, rollback และ consumer contracts ใน Emulator

Gate: failure injection, rollback proof และ payload/path budget

## Phase 5 — Network Journey

สร้าง Fixed routing, Frequency expected wait, Transfer policy, version-keyed cache, latency/load/cost tests และ rate/max-instance limits

Gate: correctness scenarios และ measured SLA/cost

## Phase 6 — Consumer Migration

ย้าย Map/Reports, Passenger search แล้วจึง Booking availability/pricing ทีละ consumer ด้วย feature flag และ rollback

Gate: Owner อนุมัติ cutover รายหน้า

## Phase 7 — Production Readiness

Rules coverage, privacy, retention, audit, budget alerts, backup/restore, rollback drill, incident runbook และ Production allowlist

Production deploy/write ต้องมีคำสั่งอนุมัติแยกที่ระบุ project, paths, version และเวลาปฏิบัติงาน

## Definition of Done

ทุก PR ระบุไฟล์ที่เปลี่ยน สิ่งที่ไม่เปลี่ยน tests environment cost impact rollback และงานถัดไป ห้าม merge/deploy แทน Owner