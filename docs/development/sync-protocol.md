# Sync protocol

Sync is opt in. Every device keeps its own SQLite database as the source of truth and works fully offline; the server only relays changes. Code: `packages/shared/src/sync` (engine, client, protocol), `apps/desktop/src-tauri/src/sync` (desktop storage), `apps/server` (server).

## Records

Each row of a synced table is one record, keyed by `(table, pk)`. `pk` is the key column's value, or a JSON array for a key of several columns. The tables and how each syncs come from the desktop's registry (`sync/registry.rs`), exported to `packages/shared/src/generated/desktop-schema.json` by `NOOKLY_UPDATE_SNAPSHOTS=1 cargo test --lib sync::export_tests`.

| Part           | What                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `fields`       | Column values, `string`, `number` or `null`. Device local columns (file paths) never leave the device. |
| `clocks`       | Per field, the clock of its last edit.                                                                 |
| `deletedClock` | The clock of its last delete. The record is alive while a field was edited after it.                   |
| `scope`        | The entity the row belongs to, which is what sharing hands out.                                        |

A clock is `<13 digit ms>-<6 digit counter>-<device id>`; string order is clock order. An edit is dated when it is made, but never before the device's `clock_floor`, one past the newest clock it has pulled, so an edit made after seeing another one always counts as later.

## Merging

Two states of a record merge field by field: the newer clock wins. This is commutative, associative and idempotent, so every device converges whatever order changes arrive in. A table marked `record` (index cards) stamps every field of an edit with one clock, so the newest edit takes the whole row.

An edit that loses to a concurrent one (made without seeing it) is written to `sync_conflicts` on the device, and to `conflicts` on the server, never dropped. A change carries `baseClocks`, the clock each field had when it was edited, which tells a concurrent edit from one that saw the value it replaced.

Page bodies merge per block: blocks are rows, so edits to different blocks of a page merge, and two edits of one block keep the newer, the other going to conflicts. A reorder rewrites block positions, so concurrent reorders keep the newer positions.

Deleting a row that other rows point at (emptying a page from Trash) removes those rows on every device too, each kept as a conflict first.

## The device side

- Triggers (`sync_<table>_<op>`, migration 42) mark changed rows in `sync_dirty` while `sync_meta.enabled` is set.
- `sync_rows` holds each record as the server last had it. A dirty row's changed fields are the ones that differ from it.
- Turning sync on marks every existing row, dated by its own `updated_at` (or its entity's), so a first sync against an account with data merges by real edit times and never overwrites a newer value.
- Every write the engine makes is one transaction with guards on the dirty versions it read. A user edit in between makes the batch stale, and the engine plans again.
- Remote rows apply parents first with foreign keys checked at commit. A record whose parent hasn't arrived is parked in `sync_meta.parked` and retried.
- Two devices can give new entities the same key offline. After applying, the later one (by `created_at`, then id) takes the next free number, which syncs like any edit.

## Wire

All under `/v1/sync`, authenticated with the access token.

| Call         | Body                                     | Returns                                                        |
| ------------ | ---------------------------------------- | -------------------------------------------------------------- |
| `POST /push` | up to 500 changes                        | per change `applied` or `rejected` (`forbidden`, `invalid`)    |
| `POST /pull` | `cursors` per dataset                    | records with a higher sequence number, per dataset, `hasMore`  |
| `GET /ws`    | first message `{ type: "hello", token }` | `ready`, then `changes` (or `datasets`) whenever there is news |

A dataset is `own` or `share:<id>`. Pushing the same change twice is harmless, so retries are safe. The client syncs pull, push, pull; it reconnects the socket with exponential backoff and a full sync, and runs a full sync every minute in case a notice was missed.
