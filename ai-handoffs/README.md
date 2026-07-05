# SL-Transit AI Handoffs

This folder contains role-specific instructions for the AI teams working on SL-Transit.

## Source of Truth
Repository: https://github.com/SL-Transit/bus/tree/main

Every AI must inspect the latest `main` branch before starting work.

## Global Hard Constraints
- GitHub is the source of truth.
- Do not edit local files.
- Do not write Firebase unless explicitly approved by the user.
- Do not create, modify, or read real passenger/private data unless explicitly approved.
- Push changes through GitHub only.
- After every push, verify GitHub Actions and GitHub Pages.
- When in doubt, produce a dry-run plan first.

## Current Priority
The current priority is the system backbone: schema, catalog, fleet, settings, migration/readiness, validation, and safe bridge contracts.

## Roles
1. Main Backbone Lead: existing lead AI controlling schema and merge contract.
2. Main Backbone Support AI: helps the lead with validators, readiness, contracts, and safe admin tooling.
3. Data Import / Catalog AI: prepares real backbone data as dry-run JSON plans.
4. QA / Release Guard AI: read-only verification and regression guard.
5. Booking Logic AI: prepares booking bridge to backbone.
6. Passenger AI: prepares passenger UI bridge to backbone.
7. Check Ticket AI: prepares ticket/QR compatibility contract.
8. Driver / Operations AI: prepares driver/live vehicle bridge.

## Recommended Start Order
1. Data Import / Catalog AI starts first.
2. QA / Release Guard AI starts in read-only mode.
3. Main Backbone Support AI starts after reading current schema/admin/data adapter.
4. Booking, Passenger, Check Ticket, and Driver AIs start with audit + bridge plan only.
5. Implementation beyond bridge-safe changes waits for Main Backbone Lead contract confirmation.

## Files
- `00-main-backbone-support-ai.md`
- `01-data-import-catalog-ai.md`
- `02-qa-release-guard-ai.md`
- `03-booking-logic-ai.md`
- `04-passenger-ai.md`
- `05-check-ticket-ai.md`
- `06-driver-operations-ai.md`