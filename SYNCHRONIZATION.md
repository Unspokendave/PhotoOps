# Smart Schedule Synchronization — 2.1

This branch builds on the approved personal PhotoOps version and its Close,
Cancel, and native Escape dialog fix. It contains no Team directory or Team
storage access. No deployment configuration or production branch is changed.

## Import and review

Configure your own name and optional aliases in Settings. There is no built-in
personal identity. Import mode is saved locally:

- **My Assignments**: new rows must have an exact normalized roster match for the
  entered name or an alias. Already matched saved work remains reviewable when
  a schedule changes its photographer. Unknown names are never invented.
- **All Assignments**: consider every valid schedule row.
- **Review Each Import**: consider every valid row, with changes unselected until
  explicitly chosen. Unchanged rows need no write.

Paste a dated text schedule or upload a `.txt` / `.json` file. Text supports the
existing sample layout: weekday/month/day date headers, optional explicit year,
`**C**` / `C` assignment boundaries, and school/type followed by hyphen-separated
information. New titled timed or recognized-type rows also create boundaries.
Use explicit years for historical imports; yearless dates use the original
current-year/rollover heuristic. Text that cannot be parsed is reported instead
of being silently accepted. A file is read locally, never uploaded to a server.

Arrival, start, end, location, address, photographer roster, and assignment type
are separate fields. Photographer rosters use a trailing comma-separated list
or an explicit `Photographers:` / `Staff:` label (required for single names).
Known type suffixes include Faculty Individuals/Groups, Sportsmates, Senior
Sports, and Senior Makeups (`SR27 MU`). Other types can use `School | Type` or
separate JSON fields. Unknown type boundaries remain unspecified for review.

Example (use your own actual name / assignment data):

```text
Mon, Nov 2, 2026
[ID: job-123] Example HS | Faculty Groups - arrival 8:30am - start 9:00am - end 1:00pm - Location: Main Gym - Address: 1 Main St - Photographers: Your Name
```

JSON accepts an array or `{ "assignments": [...] }`. Supported keys:
`sourceId` (or `assignmentId`, `jobId`, `id`), `school`, `assignmentType`, `date`
(YYYY-MM-DD), `arrivalTime`, `startTime`, `endTime` (HH:MM or h:mmam/pm), `location`,
`address`, `photographers` (array of names), `status`, `scheduleNotes`, and `notes`
(imported as schedule information, never as a replacement for personal notes).
Other JSON fields are retained as separately viewable `scheduleDetails`.
Source IDs must be unique and stable across uploads from the schedule system.
Do not reuse an ID for a different session. Existing exported app UUIDs are not
fabricated into schedule IDs during migration.

Preview shows New, Updated, Unchanged, and Ambiguous counts, skipped exact upload
duplicates, and field-by-field differences. Missing/blank source values never
clear saved fields. Select rows to apply; skip others. Ambiguous rows require an
explicit decision: update a listed saved assignment, add a separate assignment,
or skip. Protected manual fields have individual opt-in checkboxes for accepting
a new imported value. Confirmation saves the selected batch only.

## Matching and duplicate prevention

1. A unique explicit source assignment ID is strongest and recognizes changes to
   date, time, school, type, location, and photographer without changing app UUIDs.
2. Without an ID, a unique unchanged imported source snapshot matches even when
   the user customized the visible fields or has other recurring school events.
3. Otherwise a unique same-school, same-type, same-date candidate needs an
   overlapping photographer or identical known start time to prepare an update.
   Matching uses prior source fields when available, preserving manual labels.
4. Same-school candidates and same-date/type/photographer candidates with a changed
   school are proposed for review. A changed date without an ID always needs
   explicit linking. Dates/times are never the sole identity. Matching cannot
   reliably tell a reschedule from a new recurring event without an ID or review.
5. Multiple plausible targets, conflicting uploaded source IDs, and competing
   same-session rows are ambiguous. Exact duplicate uploaded rows are collapsed.
   A confirmed batch cannot update the same saved assignment twice or assign one
   source ID to different records. Deliberately separate sessions can be added
   after review; the app does not invent stable IDs or assume cancellation.

Rows absent from an upload are never removed, canceled, or aged out. Historical
assignments remain available in All dates, Day, Monday-based Week, Month, and
search/status-filtered views. Select a past date to browse history.

## Local migration, provenance, backups, and restoration

- Original `PhotoOpsAssignmentsV1` array and `PhotoOpsSettingsV1` are retained.
  Loading and previewing do not rewrite existing records. The first confirmed
  synchronization adds only needed metadata to affected records, after backup.
- Imported records keep a `sync.source` snapshot, stable `sync.sourceId`, and
  `sync.lastImportedAt`. Each update retains the full prior assignment values in
  a timestamped `history` event. History is not automatically truncated. Identical
  imports do not change timestamps or append history.
- Personal notes and contacts are never sourced over by schedule imports. Custom
  addresses with no provenance are protected; other changes marked by the editor
  or differing from their prior source remain protected. Unknown saved fields are
  preserved. Imported notes/details stay separate from user notes. The editor
  preserves metadata and marks changed schedule fields as manual overrides.
- Before each bulk sync, restore, or backup merge, an exact assignments/settings
  snapshot is saved under a unique `PhotoOpsSyncBackupV21:` key. Backups remain
  local and can be exported using **Export latest safety backup**. An ordinary
  **Export Backup** includes assignment metadata/history and settings. Copy a
  backup off-device before clearing browser storage; browser storage is not an
  indefinite archival guarantee and can be cleared by the user or OS.
- Assignment changes are prepared in memory then committed as one atomic
  localStorage value. Failed backups/quota errors abort before assignment writes;
  a failed commit leaves the old assignment value intact. A backup can remain
  after a failed attempt. Backups are not silently discarded to free space.
- The saved assignment value must still match the preview baseline. Web Locks
  serialize bulk writers where supported; an optimistic comparison is used
  otherwise. Stale previews and stale manual edits are rejected. localStorage
  cannot provide a general multi-key/cross-browser transaction or protect against
  unrelated scripts ignoring locks. Assignment and settings values are not
  rewritten together during synchronization.
- In an assignment's Details, expand **Imported schedule information & change
  history**, then choose a prior version and confirm. Restore is backed up first,
  retains the same UUID and all history, and appends a restoration event so it can
  itself be undone. This explicitly restores the full previous assignment values.
- Backup imports merge records with new UUIDs; existing UUIDs/settings win to
  prevent accidental overwrites. Use per-assignment history to restore an existing
  record, rather than silently replacing it with an older backup. Existing backups
  without the new metadata remain valid. Clear All Data explicitly clears the
  current assignment array after confirmation; safety backups are retained.

The service worker caches `sync.js` with the rest of the app in a new versioned
cache. Existing app windows may need closing/reopening for worker activation.
No remote synchronization, roster service, analytics, or new network dependency
was added. Data stays in this installation's browser origin.

## Validation

```sh
node --test tests/sync.test.js
python3 tests/browser.py
node --check app.js
node --check sync.js
node --check service-worker.js
```

Browser tests require Python Playwright and `/usr/bin/chromium`, start their own
HTTP server, and use isolated browser contexts. They exercise desktop, iPhone,
and iPad sizes, including quota/commit failure simulation and another-tab writes.
Physical iOS/Safari and OS storage eviction are not simulated.

## Completed calendars, School Directory and advanced filters

The Schedule tab now has an All Dates list, a chronological Day timeline, a
seven-column Monday–Sunday Week grid, and a traditional six-row Month grid.
Previous / Next move the displayed period (month-end dates are clamped); Today
returns to the current date without clearing active filters. Picking a grid date
opens its Day view. Assignment buttons open the existing Details window, where
Add to Calendar exports the saved assignment. Day/list cards retain their export
buttons. Mobile Week view scrolls within its own container; Month keeps seven
columns with compact assignment indicators. Calendar colors follow dark mode.
Historical dates remain available without aging out or modifying any records.

Advanced filters combine exact school name, assignment type, inclusive start/end
dates, status and the existing text search. All views use the same filter function.
Counts describe the matching assignments in the displayed period, or across all
dates in All Dates. Reset Filters clears search, school, type, range and status,
while preserving the displayed calendar period. Invalid ranges get an explicit
message. Calendar navigation does not clear filters. School/type options reflect
saved assignments, including historical school names and active filter values.

Schools is a separate tab. A local school entry stores name, street address, city,
state/region, ZIP/postal code, optional phone and notes. Add, edit, search, Directions,
and confirmed removal are available. Name + city + state comparisons ignore case
and repeated whitespace to prevent accidental duplicates. Distinct campuses in
the same city should have distinct names. No fixed school or organization is built
in. Directory suggestions use the assignment School input's native autocomplete
list, with city/state/postal code to distinguish same-name schools. Selecting one
fills the address; a pre-existing custom address requires confirmation before
replacement. Individual assignments can override the address without editing the
school. Editing, renaming or removing a school never rewrites assignment snapshots.
Assignments may retain the removed school's ID as historical linkage.

The directory uses the additive `PhotoOpsSchoolsV1` key. No startup migration or
rewrite of original assignments/settings is needed. School changes receive safety
backups, including the current directory. Ordinary and safety exports include
`schools`. Old backups without schools leave the directory untouched. Directory
restore merges entries by UUID or normalized school identity, preserves current
fields on conflicts, and remaps school references for newly restored assignments.
It does not replace existing assignments, settings, school edits or custom addresses.

When restoring both assignments and schools, the app writes a recovery journal
under `PhotoOpsRestoreJournalV21` before changing either store. On success it clears
the journal. A failed write rolls back both previous raw values; an interrupted
restore is rolled back before the next startup reads assignments or schools. This
extends the original single-key sync protection without changing the assignment
array format. A pending or invalid recovery journal blocks new transactions until
recovery, rather than silently accepting a partial restore. Normal synchronization
still changes only the assignment store and never clears directory information.
Clear Assignments retains the directory and safety backups; remove schools explicitly.

Additional validation:

```sh
node --test tests/*.test.js
python3 tests/browser.py
python3 tests/planner_browser.py
node --check planner.js
node --check storage.js
```

Coverage includes leap years/month-end navigation, chronological timelines, grid
placement, Today/date/event navigation, combined filters/counts/reset, duplicate
schools, editing/search/autofill/custom overrides, directory removal preserving
assignments, old/new backup formats, failed two-store writes, startup recovery,
dark mode, offline loading, and desktop/iPhone/iPad viewport sizes in Chromium.
