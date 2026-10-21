# PhotoOps 2.1 feature completion

| Approved feature | Completion | Implementation |
| --- | --- | --- |
| Day, Week, Month calendars and Today navigation | Complete | Chronological Day timeline, seven-day Week grid, six-row Month calendar with indicators; Previous/Next/Today, date and assignment selection, saved-assignment calendar export. |
| Smart importing and synchronization | Complete for documented text/JSON formats | Stable IDs, conservative fallback, one-click confident updates, collapsed optional ambiguity attention, partial uploads, no historical deletion, provenance, backups and restoration. |
| Expanded assignment details | Complete | Arrival, start/end, location/address, contacts, notes, status and assignment type; imported information remains separate. |
| School Directory | Complete | Local CRUD/search, full address/phone/notes, duplicate checks, native school suggestions, address autofill with custom override protection, Directions, backup/restore. Removal does not change assignments. |
| Advanced schedule filters | Complete | School, inclusive start/end, type, status and search combine across list/calendar layouts; Reset, counts, empty/invalid-range messages. |
| Configurable identity/import preferences | Complete | User name/aliases and My/All modes (legacy review preference safely defaults to My); local storage. |
| + Add fix and no Team features | Complete | Close/Cancel are non-submit controls; native Escape supported. No Team code, directory, tab or storage access. |

Files:
- `index.html`, `app.js`, `styles.css`: calendar/directory/filter interface and orchestration.
- `planner.js`: calendar dates/navigation, shared filters, school validation/search/merge.
- `storage.js`: multi-store restore rollback and startup recovery.
- `sync.js`: retained synchronization model.
- `service-worker.js`: new cache version includes planner/storage modules.
- `tests/sync.test.js`, `tests/planner.test.js`, `tests/browser.py`, `tests/planner_browser.py`: automated verification.
- `SYNCHRONIZATION.md`: matching, data preservation, backup and feature guidance.

Limits: parsing supports the documented schedule formats; uncertain identities
require review. Week grids scroll horizontally on narrow screens. Namesake schools
can be distinguished in the directory by city/state; the schedule's name filter
groups assignments sharing a school name. Browser storage is local and can be
cleared by the browser/OS, so export off-device backups. Tests use Chromium at
390×844, 768×1024 and 1440×1000, not physical iOS/Safari devices or native Windows.
See IMPORTING.md for the simplified workflow and specific recognition regressions.
No merge or deployment is part of this change.

Reminder lead time has been removed from the current Settings UI and runtime.
It never scheduled notifications or calendar alarms. New settings omit it; any
legacy stored value is left inert to avoid rewriting users’ settings on startup.
