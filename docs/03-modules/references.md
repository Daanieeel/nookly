# Module: References

A Reference is a pointer to something Nookly does not own: a file on disk, a link, a Moodle course or assignment. It keeps who it points at (provider, path, link or id) and the last facts seen (a title, when it last answered), never the content. A Moodle grade or post is still read live, never copied.

A reference is either its own entity (`type = reference`, key `REF-n`: a link or a Moodle object), or the pointer half of a File that is not stored in Nookly. Both live in `entity_references`. Either way it can be linked, is searched by title, goes to Trash like everything else and is exposed through the CLI. A reference is never deleted automatically.

## States

Worked out live on each device, never stored in the record. A file that is fine on the Mac is "Not on this device" on the phone, so a stored state would be wrong somewhere.

| State               | Meaning                                      |
| ------------------- | -------------------------------------------- |
| Available           | The file is found, Moodle answers            |
| Offline, as of ...  | Cannot be reached, the last answer is shown  |
| Missing             | The path is gone or the link is dead         |
| Needs sign in       | The token expired or is missing              |
| Not on this device  | A path that exists on another device only    |

One wording for each, in `lib/reference-state.ts`, drawn by `ReferenceStateBadge`. The badge shows the state; its tooltip explains it. "As of" is shown only for Offline, so an Available reference carries no date.

What is stored is only the last result and `last_seen_at`, written when something changed or the last answer is over an hour old.

## Files on several devices

A file path is kept per device (`reference_device_paths`, the device id is in `device-id` in the data folder, left out of backups). **Locate...** picks the same file on this device and changes only this device's path. **Copy into Nookly** makes a stored File, which syncs through cloud storage. Nothing is uploaded without a click.

## Referenced Files

A File added by path, or a link never downloaded, has a reference under its own id. It stays a File: same type, key, relationships and Files page. Its `sourcePath` is this device's path. The old `files` columns are kept, so a rollback finds them.
