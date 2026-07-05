# Start Here For All SL-Transit AIs

## Command
Read this file first, then read your role-specific handoff file in `ai-handoffs/`.

## Repository
https://github.com/SL-Transit/bus/tree/main

## Mandatory First Step
Before doing anything, inspect the latest GitHub `main` commit and the current contents of your assigned files.

## Safety Rules
- GitHub is the source of truth.
- Do not edit local files.
- Do not write Firebase unless explicitly approved.
- Do not create, modify, or read real passenger/private data unless explicitly approved.
- Prefer dry-run plans and read-only checks.
- If you push, verify GitHub Actions and GitHub Pages.

## Coordination Rule
The Main Backbone Lead owns the schema contract. If your work needs a new schema path, adapter function, or data shape, report it as a request instead of silently changing the contract.

## Current Work Mode
- Data Import AI: produce dry-run catalog/fleet/settings JSON plan.
- QA AI: verify read-only and report regressions.
- Main Backbone Support AI: strengthen validators/readiness and review handoffs.
- Booking/Passenger/Check Ticket/Driver AIs: audit + bridge plan first, implementation only when the existing backbone contract supports it.