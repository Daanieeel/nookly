# References

A reference is a record behind a File that only points at something Nookly does not own: a file on disk, a link, later a Moodle course. It keeps who it points at (provider, path or link) and the last facts seen (a title, when it last answered), never the content. A Moodle grade or post is still read live, never copied.

**Users never see a reference.** The File keeps its type, id and key, so everything that works for a File works for it: relationships, mentions, labels, search, Trash, the Files page and the CLI. It is just a File that knows whether it can be found. A link kept without downloading is a File too (`file create --field linkUrl=...`). Records live in `entity_references`.

## States

Worked out live on each device, never stored in the record. A file that is fine on the Mac is "Not on this device" on the phone, so a stored state would be wrong somewhere.

| State              | Meaning                                     |
| ------------------ | ------------------------------------------- |
| Available          | The file is found, Moodle answers           |
| Offline, as of ... | Cannot be reached, the last answer is shown |
| Missing            | The path is gone or the link is dead        |
| Needs sign in      | The token expired or is missing             |
| Not on this device | A path that exists on another device only   |

One wording for each, in `lib/reference-state.ts`, drawn by `ReferenceStateBadge`. The badge shows the state; its tooltip explains it. "As of" is shown only for Offline, so an Available file carries no date.

Every File reports an `availability`: a stored copy is Available or Missing, a pointer to a file on disk gets its state at once, and a kept link needs the network, so `check_reference` asks. What is stored is only the last result and `last_seen_at`, written when something changed or the last answer is over an hour old.

## Files on several devices

A file path is kept per device (`reference_device_paths`, the device id is in `device-id` in the data folder, left out of backups). **Locate...** picks the same file on this device and changes only this device's path. **Copy into Nookly** makes a stored File, which syncs through cloud storage: it copies a file on disk, or downloads a kept link. Nothing is uploaded without a click.

## Moodle

The Moodle providers (`moodle_course`, `moodle_assignment`) are checked against the live site (`MoodleState::probe_reference`), never the cache. Nothing creates one yet: linking a Moodle course to a Course needs a place in the Moodle module for it.
