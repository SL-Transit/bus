# Request: `publishedSchedule` precomputed node (for passenger.html + booking.html)

Author: Passenger AI
Date: 2026-07-06 (Asia/Bangkok)
Requested from: Main Backbone Lead / Data Import AI
Status: REQUESTED — not implemented by Passenger AI (no Firebase writes performed)

## Why

Owner directive: `passenger.html` must be display-only — no business logic,
no hard-coded rules, no independent decisions about transfers, aliases, or
which departure times are valid. It should only ask ERP and render exactly
what it's given.

Passenger-side code that decided these things itself has been **removed**
from `passenger-logic.js` in this pass (`isLeg2Dest`, `normalizeRouteAlias`,
`cleanRouteLabel`, `getLeg1TimesToTransferHub`, `isPassengerTimeDisabled`,
`getActivePassengerTimes`, `getLeg1Times`, and the whole legacy
`data/settings.routes` parser `applyPassengerRouteSettings`). Passenger now
expects one ready-to-render node instead. Until this node exists, passenger's
schedule UI shows "waiting for schedule data" — accepted as OK for now since
there are no live passengers using this page yet.

## Requested shape — `publishedSchedule` (top-level node, same tree as
`settings`/`routeData`/`publishedCatalog` today; path/name is Main Backbone
Lead's call, this is the minimum shape passenger needs)

```json
{
  "origins": ["คลองหาด", "สนามชัยเขต", "...", "ฉะเชิงเทรา (แปดริ้ว)"],
  "destinations": {
    "ฉะเชิงเทรา (แปดริ้ว)": { "group": null },
    "พัทยา": { "group": "ต่อรถ" },
    "...": { "group": null | "<group label to show as an <optgroup>>" }
  },
  "pairs": {
    "<originLabel>__<destLabel>": {
      "transfer": false,
      "segments": [
        {
          "label": "เส้นทาง",
          "fromLabel": "<originLabel>",
          "toLabel": "<destLabel>",
          "times": [
            { "time": "08:00", "disabled": false },
            { "time": "09:00", "disabled": true }
          ]
        }
      ]
    },
    "<originLabel>__<transferDestLabel>": {
      "transfer": true,
      "segments": [
        { "label": "เที่ยวที่ 1", "fromLabel": "...", "toLabel": "ฉะเชิงเทรา (แปดริ้ว)", "times": [ ... ] },
        {
          "label": "เที่ยวที่ 2",
          "fromLabel": "ฉะเชิงเทรา (แปดริ้ว)",
          "toLabel": "พัทยา",
          "times": [ ... ],
          "note": "ชำระค่าโดยสารส่วนนี้นอกระบบ SL-Transit"
        }
      ]
    }
  }
}
```

## Design intent (why this shape)

- **`origins` / `destinations`**: passenger just lists these directly for
  the two `<select>` dropdowns, in the order given, grouped by `.group`
  exactly as given (no client-side sorting/guessing which destinations are
  "special").
- **`pairs["<origin>__<dest>"]`**: keyed by the exact label pair passenger
  already has selected — O(1) lookup, no matching/aliasing needed client-side.
- **`disabled` per time-entry**: ERP/booking already knows which specific
  departures are cancelled today; passenger just reads the flag, it never
  computes or looks up a separate disabled-times list itself.
- **`note` per segment**: this is exactly how something like a group_005/train
  (external_pay) leg should be communicated to passenger — ERP decides
  whether/what note to attach; passenger has zero classification logic and
  just prints whatever note string it's given (or nothing, if none).
- **`transfer` + `segments[]`**: generalizes past a hard-coded 2-leg model —
  if a future route needs 3 legs, passenger's renderer already loops
  `segments` without change.

## What passenger will NOT do, by design

- Will not decide if a destination needs a transfer.
- Will not guess a "hub" stop name or alias mismatched labels.
- Will not maintain its own disabled-times list.
- Will not decide whether/what note to show for a special fare arrangement.
- Will not sort/rank stops by name if `.order`/list order is missing — that's
  now entirely Main Backbone/Data Import AI's responsibility (see the
  separate stop-ordering task already in progress).

## Consumers

Booking.html could read the same node for its own schedule display, so the
"where is a trip a transfer, what's the note" question only has one answer
in the whole system, not one per page. (Not requesting a change to
booking.html here — Booking AI's own audit is a separate, parallel task.)

## Safety

No Firebase writes performed by Passenger AI. This is a specification
request only, to be implemented by Main Backbone Lead / Data Import AI (or
whoever owns write access to this data), reviewed against the approved
import-plan validator before any apply.
