# Settings

Hard settings live in `settings.json` in the app data folder, a flat JSON object keyed by setting id. Code reads and writes them through [`packages/frontend/src/lib/settings/settings.ts`](../../packages/frontend/src/lib/settings/settings.ts); the list is [`registry.ts`](../../packages/frontend/src/lib/settings/registry.ts). View state (sorts, tabs, filters, display options, dismissed cards) stays in `preferences.json`, see [`preference-keys.md`](preference-keys.md).

Ids are `<category>.<name>`, like `appearance.theme`. The category is one of `general`, `appearance`, `calendar`, `notes`, `shortcuts`. An id is never renamed once released.

## Add a setting

1. Add an entry to `SETTINGS` in `registry.ts` with a title, description, synonyms for search, a default and a `parse` that turns anything into a valid value.
2. Read it with `settings.get(id)` or `useSetting(id)`, write it with `settings.set(id, value)`. Use `subscribeSetting(id, fn)` outside React.

## Moving a preference over

Set `legacyKey` (and `fromLegacy` for a different old format) on the entry. On start, a legacy key that is missing from `settings.json` is copied in, saved, read back from disk, and only then deleted from preferences. A failure leaves the old key for the next start. A value already in `settings.json` wins over a leftover old key.

A `settings.json` that can't be read leaves every setting at its default and is never written to. The app also keeps a `settings.json.corrupt-<hash>` copy of a damaged file.
