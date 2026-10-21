PhotoOps — VERSION 1

Included:
- Mobile-friendly dashboard
- Paste and process a company schedule
- Automatic filtering for "David Denk"
- Confirmed, Training, Tentative, and TBD labels
- Search and status filters
- Manual add/edit/delete
- Apple Maps directions
- Add individual assignments to your phone calendar (.ics)
- Local data storage
- Backup export/import
- Dark mode
- Installable web-app files

HOW TO OPEN
1. Extract the ZIP.
2. Open index.html in a browser for a preview.

For full iPhone Home Screen installation and offline mode, upload the folder to a basic web host
such as GitHub Pages, Netlify, or your own website, then open its address in Safari and choose:
Share > Add to Home Screen.

Your schedule stays in that browser's local storage unless you export a backup.

TEAM (photoops-v2)
- Import the company schedule once: personal rows remain in Schedule, and all
  explicitly identified coworkers appear in Team. Select a coworker to see dates,
  times, school/location, type, roster, original notes, and calendar export.
- Search by coworker name and filter by assignment type. Counts reflect the type
  filter. Shared assignments are stored once with a photographers array.
- Supported names: trailing comma-separated rosters in the supplied sample format,
  or an explicit "Photographers: Name, Name" / "Staff: Name" label. Single names
  require an explicit label. Ambiguous segments are retained under Team's
  assignments without identified photographers; names are never inferred from
  capitalized school/location words. Reimport clarified source rows to add names.
- Recognized types include Sportsmates, Faculty Individuals, Faculty Groups,
  Senior Sports, and Senior Makeups (including SR27 MU). Other title suffixes
  following HS/MS/ES, or "School name | Assignment type", are retained as types.
  Titles with no clear type boundary remain Uncategorized. Full source text is kept.

DATA / MIGRATION
- Existing PhotoOpsAssignmentsV1 and PhotoOpsSettingsV1 keys are retained. Loading
  this version does not rewrite them or remove old records. Legacy type/roster
  metadata is derived in memory from existing school/notes fields where possible.
- New company imports also use PhotoOpsTeamAssignmentsV1. Personal imports add only
  rows whose parsed roster contains the selected personal name (David Denk by
  default); David is excluded from Team. Existing personal records stay personal.
- Imports merge by date, normalized school, type, start/end time, and location /
  address; repeated rows merge photographer sets and retain source-text variants.
  Existing IDs, notes, custom fields, and assignments are preserved. Different
  types or times stay separate. Imports do not delete assignments missing from
  a later schedule. Explicit Clear All Data still clears both stores after consent.
- Backup schemaVersion 2 includes personal, Team, and settings data. Older backups
  are accepted. Restores merge assignments into existing stores rather than
  removing newer entries. Export a backup before trying a new release.
- Coworker-only assignments discarded by older releases cannot be reconstructed;
  reimport the original company schedule to populate them. No server-side data
  or external coworker roster is used.
- Service worker v4 caches schedule.js and uses only its current version's cache.
  An already open installed app may need to be closed and reopened for the new
  service worker to activate. No storage keys are deleted by the cache update.

AUTOMATED TESTS
From the repository root:
  node --test tests/schedule.test.js
  python3 tests/browser.py
The browser suite requires the Python playwright package and Chromium at
/usr/bin/chromium. It starts its own local HTTP server and uses fresh isolated
browser contexts, never your normal browser's saved data. It covers iPhone,
iPad, and desktop viewport sizes in Chromium; physical iOS/Safari testing is
still recommended before deployment. No build step or runtime dependencies
were added to the application.
