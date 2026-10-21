# Simple schedule importing (PhotoOps 2.1)

Enter **Name to Find**, paste a dated text schedule or upload `.txt` / `.json`,
then click **Import & Update Schedule**. No preview or per-assignment approval is
required for confident changes. My Assignments uses the entered name plus optional
aliases; All Assignments explicitly includes everyone's work. Changing the name
changes which incoming rows are considered, including when a school is already
saved. It does not delete previously saved work for a different name.

The result is one concise line: added, updated, unchanged, and need attention.
A collapsed optional section retains unresolved items across reloads. You can
explicitly link an uncertain reschedule to a saved assignment, add it separately,
or dismiss the item. Normal imports do not require handling these items first.
The retired Review Each Import preference falls back to My Assignments without
rewriting stored settings on startup. The pure model retains its legacy review
API for compatibility; it is not exposed in the normal importing interface.

## Reproduced causes and evidence

The original company example from the repository's first `app.js` is preserved
verbatim in `tests/fixtures/original-company-schedule.txt` (Hickory, Jamestown and
Woodside; shared photographer lists). Tests also exercise realistic **variants of
that format**, not a claim that unseen user files were tested.

Comparison against the parser/model at commit `541834e` reproduced:

| Case | Before | After |
| --- | --- | --- |
| Single trailing `David Denk` after school/time | No names identified | Correct person and school |
| `Photographers: David Denk` before the school | Rest of entry swallowed into the name field; no match | Correct person and school |
| Shared `Tripp, David Denk` between school and time | Only the final segment was checked; no match | Both names identified |
| Different photographer at an already saved school in My Assignments | Existing candidate bypassed the name filter | Row excluded unless entered name/alias matches |

A separate overly broad ambiguity rule blocked confident same-day updates merely
because another date at the same school existed. A unique corroborated same-day
match now wins; multiple plausible same-day sessions and uncertain reschedules
still remain untouched for explicit attention. IDs continue to allow confident
automatic rescheduling without duplicate assignments.

## Supported text layouts and name matching

- Weekday/month/day headers, with an optional explicit year. Use explicit years
  for historical schedules. Existing yearless rollover behavior is preserved.
- Existing `**C**` / `C` assignment markers and titled/time-bearing assignment rows.
- Dash/newline-separated school, time, name and location fields.
- `Photographer:`, `Photographers:`, `Staff:`, or `Assigned to:` name labels at the
  beginning, middle, end, or on their own line within a dated assignment.
- Single or multiple names in the final photographer slot. Lists accept commas,
  semicolons, `&`, or `and`. A leading separated name is recognized when followed
  by an identifiable school/type. Unlabelled middle name fields can use the entered
  name/aliases as corroboration. These rules do not search arbitrary descriptions
  for capitalized words or name substrings.
- Case, repeated/Unicode whitespace, periods in initials, curly/straight
  apostrophes, and `last, first` for the configured name are normalized. Full names
  are matched exactly after normalization: `David` does not silently match
  `David Denk`, and `Ann` does not match `Anna`. Add explicit alternate names as
  aliases when the schedule uses initials or a nickname.
- Labelled fields should be separated by a dash or new line; a label followed by
  known next-field labels is also bounded. Location/address words and unlabelled
  city/state pairs are not treated as people. A name-only row is not a school.

JSON accepts an array or an `assignments` array with the documented school/date/
time fields, a `photographers` array or separated string, or one `photographer`
string. Unknown supplied details remain separate from personal notes.

## Unsupported or ambiguous input

PDFs, images/screenshots, Excel files, arbitrary CSV/HTML tables, schedules without
supported dates, per-photographer column matrices, and free prose with names mixed
into descriptions require conversion to supported text/JSON. General `last, first`
lists without labels/configured-name corroboration are ambiguous. Unknown role
annotations or unlabeled locations indistinguishable from names may require
explicit photographer labels. No fuzzy partial-name, nickname or surname guessing
is performed. These are format limits, not evidence that every real-world schedule
can be parsed automatically.

When My Assignments cannot identify anyone, the main result says so plainly and
suggests a labelled name field or explicitly choosing All Assignments. Recognized
rows for other people are skipped, with a clear no-match result if none match.
Malformed portions generate a single aggregate attention item, not a wall of raw
parser warnings. Source text is retained in imported information/attention records.

## Data protection

Existing matching/provenance, history/restore, manual notes/contacts/custom fields,
historical retention, safety snapshots, School Directory and calendar/filter rules
remain intact. No assignments absent from an upload are deleted. Identical imports
do not write assignments or add update history. Uncertain records are never
silently merged or inserted as duplicates.

Pending issues use the additive local `PhotoOpsImportAttentionV21` key. Assignment
and attention changes share the existing recovery-journal transaction. Failed
backups or commits do not leave a partial assignment batch. Safety and ordinary
backups include attention records; explicit restore merges them without removing
local pending work. Initialization does not reset existing data or settings.
The service worker's cache version changes so the new UI and parser load together.
No Team features, external synchronization, or deployment changes are introduced.

Validation: `node --test tests/*.test.js`, `python3 tests/browser.py`, and
`python3 tests/planner_browser.py`. Browser tests use disposable Chromium contexts
at desktop, iPhone and iPad viewport sizes, including uploaded company text,
changing selected names after saving, repeated imports, updates, optional attention
resolution, storage failures, history preservation, calendar export and offline
reload. Physical Safari/iOS devices and unseen user uploads are not claimed tested.
