# Settings

Hard settings live in `settings.json` in the app data folder, a flat JSON object keyed by setting id. Code reads and writes them through [`packages/frontend/src/lib/settings/settings.ts`](../../packages/frontend/src/lib/settings/settings.ts); the list is [`registry.ts`](../../packages/frontend/src/lib/settings/registry.ts). View state (sorts, tabs, filters, display options, dismissed cards) stays in `preferences.json`, see [`preference-keys.md`](preference-keys.md).

Ids are `<category>.<name>`, like `appearance.theme`. The category is one of `general`, `appearance`, `calendar`, `notes`, `shortcuts`. An id is never renamed once released.

## Add a setting

1. Add an entry to `SETTINGS` in `registry.ts` with a title, description, synonyms, a default and a `schema` (anything else on disk becomes the default).
2. Add its row to `SETTING_UI` in [`features/settings/setting-rows.tsx`](../../packages/frontend/src/features/settings/setting-rows.tsx): a `section` (one of `SECTIONS` for its category) and a `control`. The record is typed by setting id, so a setting without one fails the build, and a test checks every id has a row in the dialog.
3. Read it with `settings.get(id)` or `useSetting(id)`, write it with `settings.set(id, value)`. Use `subscribeSetting(id, fn)` outside React.

The Settings dialog (titlebar gear, `Mod+,`, "Open Settings" in the commands palette) draws the title, description, id and a reset button for you. The control only edits the value and should carry an `aria-label` equal to the title. A value that needs a side effect on reset, like the theme, goes in `SettingRow.tsx`.

A row with no stored value (a button that opens a dialog) goes in `ACTION_ROWS` instead.

## Search synonyms

The dialog search ([`lib/settings/search.ts`](../../packages/frontend/src/lib/settings/search.ts)) matches every typed word against the title, `synonyms`, id and description, in that order of weight, tolerating typos. List the other words someone would type: `timezone` has "time zone", "clock", "utc", "region". Use whole words or short phrases, not near spellings of the title.

## Moving a preference over

Set `legacyKey` (and `fromLegacy` for a different old format) on the entry. On start, a legacy key that is missing from `settings.json` is copied in, saved, read back from disk, and only then deleted from preferences. A failure leaves the old key for the next start. A value already in `settings.json` wins over a leftover old key.

A `settings.json` that can't be read leaves every setting at its default and is never written to. The app also keeps a `settings.json.corrupt-<hash>` copy of a damaged file.
