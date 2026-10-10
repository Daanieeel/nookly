# Settings

Hard settings live in `settings.json` in the app data folder, a flat JSON object keyed by setting id. Code reads and writes them through [`packages/frontend/src/lib/settings/settings.ts`](../../packages/frontend/src/lib/settings/settings.ts); the list is [`registry.ts`](../../packages/frontend/src/lib/settings/registry.ts). View state (sorts, tabs, filters, display options, dismissed cards) stays in `preferences.json`, see [`preference-keys.md`](preference-keys.md).

Ids are `<category>.<name>`, like `appearance.theme`. The category is one of `general`, `appearance`, `calendar`, `notes`, `backup`, `agent`, `shortcuts`. An id is never renamed once released.

## Add a setting

1. Add an entry to `SETTINGS` in `registry.ts` with a title, description, synonyms, a default and a `schema` (anything else on disk becomes the default).
2. Add its row to `SETTING_UI` in [`features/settings/setting-rows.tsx`](../../packages/frontend/src/features/settings/setting-rows.tsx): a `section` (one of `SECTIONS` for its category) and a `control`. The record is typed by setting id, so a setting without one fails the build, and a test checks every id has a row in the dialog.
3. Read it with `settings.get(id)` or `useSetting(id)`, write it with `settings.set(id, value)`. Use `subscribeSetting(id, fn)` outside React.

The Settings dialog (titlebar gear, `Mod+,`, "Open Settings" in the commands palette) draws the title, description, id and a reset button for you. The control only edits the value and should carry an `aria-label` equal to the title. A value that needs a side effect on reset, like the theme, goes in `SettingRow.tsx`.

A setting read where it is used (a calendar length, the snap, the notes editor's arrow rules) is read with `settings.get` at that moment, so a change applies without a restart.

A row with no stored value (a button that opens a dialog or runs something, like Back up now) goes in `ACTION_ROWS` instead.

The Backup tab holds everything about backups inline: the folder, the daily switch, Back up now and Restore (the controls live in [`features/backup`](../../packages/frontend/src/features/backup)). A restore still ends in `ConfirmPermanentDialog` with a typed phrase.

## Agent files

The Agent tab edits plain `.md` files in `agent/` inside the app data folder (`.dev-data` in debug builds), for the user's own coding agent. The first visit creates the folder and an `AGENTS.md` starter, which is never overwritten and cannot be deleted. Writes go through a temp file and a rename. A deleted file moves to `agent/.trash/<timestamp>-<name>`. The tab shows the folder path with a copy button. Code is in `commands/agent_files.rs` and `features/settings/AgentFilesTab.tsx`.

## Shortcuts

Every entry of `HOTKEYS` in [`lib/hotkeys.ts`](../../packages/frontend/src/lib/hotkeys.ts) is a rebindable shortcut and the default of the setting `shortcuts.<name>`. Only overrides are stored: absent means the default, a hotkey string replaces it, `null` means unassigned.

Add a shortcut: add it to `HOTKEYS`, then to `SHORTCUT_META` in [`lib/shortcuts.ts`](../../packages/frontend/src/lib/shortcuts.ts) (title, description, synonyms, `section`, `scopes`). The registry entry and the Settings row are generated from it, and a test fails without the metadata. Register it by name, `useAppHotkey("search", fn)`, and show it with `<ShortcutKbd name="search" />`, `useShortcut(name)` or `shortcutLabel(name)`, never a literal key.

A scope is where the shortcut is active (`global`, `lists`, `calendar`, `task`, `deck`). The same key on two shortcuts is a clash only when their scopes overlap, and `global` overlaps everything. `resolveShortcuts` builds the effective map and can never return two active shortcuts on one key: an explicit override beats a default, and every loser (also one that hits a fixed shortcut) is unassigned and logged once, so a hand edited `settings.json` is safe.

Changes from Settings go through `planShortcutChange` (`features/settings/shortcut-editing.ts`): a key owned by a fixed shortcut is refused inline, a key used by another shortcut asks first and, on Reassign, unassigns the other and sets this one in one `settings.apply`. A shortcut without a command modifier (Cmd, Ctrl, Alt) is only allowed when its default is a bare key.

Fixed shortcuts (`FIXED_SHORTCUTS`: copy, paste, select all, undo, Escape, the context menu key, study session keys, PDF find) have their own listeners and are listed read only. Add a key there when a new capture phase or editor listener claims one.

## Search synonyms

The dialog search ([`lib/settings/search.ts`](../../packages/frontend/src/lib/settings/search.ts)) matches every typed word against the title, `synonyms`, id and description, in that order of weight, tolerating typos. List the other words someone would type: `timezone` has "time zone", "clock", "utc", "region". Use whole words or short phrases, not near spellings of the title.

## Renaming a setting

Set `previousIds` on the entry (`backup.folder` has `["general.backupFolder"]`). On start, a value under an old id is copied to the new id, saved, read back from disk, and only then deleted. A failure leaves the old id for the next start. A value already under the new id wins, and the old one is just removed. Keep `legacyKey` pointing at the original preferences key, it moves straight to the new id.

## Moving a preference over

Set `legacyKey` (and `fromLegacy` for a different old format) on the entry. On start, a legacy key that is missing from `settings.json` is copied in, saved, read back from disk, and only then deleted from preferences. A failure leaves the old key for the next start. A value already in `settings.json` wins over a leftover old key.

A `settings.json` that can't be read leaves every setting at its default and is never written to. The app also keeps a `settings.json.corrupt-<hash>` copy of a damaged file.
