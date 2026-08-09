# คำสั่งล่าสุดจากเจ้าของ — 2026-08-09

ก่อนใช้ข้อสรุปเก่า ผู้ช่วยทุกตัวต้องอ่าน `ai-handoffs/MAIN-AI-DASHBOARD.md` ส่วน `มติเจ้าของล่าสุด: หลักการเลือกเส้นทาง ป้าย และจุดต่อรถ — 2026-08-09`

ให้ใช้เฉพาะหลักการออกแบบจากส่วนนั้น ห้ามนำชื่อสถานที่ สาย จุดเชื่อมต่อ เวลา ราคา จำนวนกลุ่ม หรือสถานการณ์ตัวอย่างจากบทสนทนาไปใช้เป็นข้อมูลจริง และห้ามเริ่มแก้โค้ดหรือฐานข้อมูลโดยไม่มีการอนุมัติแยกสำหรับงานนั้น

---
# Start Here For All SL-Transit AIs

## Command
Read this file first, then read the coordination files, then read your role-specific handoff file in `ai-handoffs/`.


## Highest Current Precedence

Before using older handoff notes, every AI must read `ai-handoffs/MAIN-AI-DASHBOARD.md` section:

`2026-07-26 OWNER-APPROVED ADMIN CONSOLE DIRECTION`

That section is the latest Owner decision and overrides conflicting older coordination notes. Do not start Screen 02, do not edit consumer pages, and do not merge/deploy from documentation-only work unless a later Owner instruction explicitly changes that.

## Repository
https://github.com/SL-Transit/bus/tree/main

## Mandatory First Step
Before doing anything, inspect the latest GitHub `main` commit and the current contents of your assigned files.

Then read:
- `ai-handoffs/WORK-STATUS.md`
- `ai-handoffs/CENTRAL-REPORT.md`
- `ai-handoffs/COORDINATION-RULES.md`
- `ai-handoffs/ADMIN-CONSOLE-ERP-BLUEPRINT.md`

## Safety Rules
- GitHub is the source of truth.
- Do not edit local files.
- Do not write Firebase unless explicitly approved.
- Do not create, modify, or read real passenger/private data unless explicitly approved.
- Prefer dry-run plans and read-only checks.
- If you push, verify GitHub Actions and GitHub Pages.

## Coordination Rule
The Main Backbone Lead owns the schema contract. If your work needs a new schema path, adapter function, or data shape, report it as a request instead of silently changing the contract.

Before editing any file, check `WORK-STATUS.md`. If another AI has `IN_PROGRESS` on the same area or file, do not edit it. Add a report or wait for the Main Backbone Lead.

After finishing, add or request a report in `CENTRAL-REPORT.md` so other AIs know what changed.

## Current Work Mode
- Data Import AI: produce dry-run catalog/fleet/settings JSON plan.
- QA AI: verify read-only and report regressions.
- Main Backbone Support AI: strengthen validators/readiness and review handoffs.
- Booking/Passenger/Check Ticket/Driver AIs: audit + bridge plan first, implementation only when the existing backbone contract supports it.
