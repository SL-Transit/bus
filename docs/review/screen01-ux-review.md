# Screen 01 UX Refresh Review

Status: Draft PR review artifact.

Scope:
- Refreshes the existing `admin-erp.html` Dashboard Screen 01 business canvas.
- Preserves the existing shell, sidebar, topbar, navigation behavior, and Central Read Model boundary.
- Does not start Screen 02 and does not connect new production data sources.

Dashboard changes:
- Adds six business KPIs: website visits, approximate visitors, bookings today, passenger gross collection, platform service fee revenue, and pending refunds.
- Adds time range controls for today, daily, monthly, 6 months, and 1 year.
- Adds money overview cards separating passenger collection, provider fares, platform fee revenue, and passenger refunds.
- Adds vehicle/driver settlement table shell.
- Adds transfer queue/provider settlement table shell.
- Adds latest refund table shell.
- Adds source status and last-updated section.

Removed from Dashboard content:
- Incident KPI and incident panels.
- Blackbox quick action.
- GPS quality panel.
- operations map / vehicle map.
- driver app status widgets.

Data policy:
- Uses the existing read model shape only.
- Displays unavailable for unresolved website analytics, payment/revenue, refund, settlement, and payout contracts.
- Does not draw a revenue chart without a confirmed time-series contract.
- Does not use screenshot values, mock business numbers, random numbers, or legacy fallback data.

Screenshots:
- Desktop: `docs/review/admin-dashboard-screen01-ux-refresh-desktop.png`
- Mobile: `docs/review/admin-dashboard-screen01-ux-refresh-mobile.png`

Safety:
- Firebase writes: none.
- Firebase Rules changes: none.
- Consumer page changes: none.
- Deploy: none.
- Merge: none.
- Screen 02: not started.
