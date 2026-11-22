# Testing the desktop app against sync.nookly.work

How to run a real, isolated sync test: multiple desktop instances on one machine, a seeded
dataset, and the real remote server, without ever touching the installed production app or its
data, and driven end to end with `cua-driver` so the run is reproducible.

## Rules

- Never point a test instance at the installed app's data. A debug build already redirects its
  data directory away from the real one (see `resolve_app_data_dir` in `db/mod.rs`): set
  `NOOKLY_DATA_DIR` to a scratch folder per instance and it never touches
  `~/Library/Application Support/com.nookly.app`. Confirm the production app's pid/data dir
  before starting (`ps aux | grep Nookly`, `ls ~/Library/Application Support`), and leave it
  alone for the whole run.
- Run at most two GUI instances at once (more degrades the machine). A third dataset can be
  prepared and driven headless through the CLI without a GUI window.
- Treat the Heroku Postgres DB and the `nookly-files` Scaleway bucket as disposable while they
  only hold test data (confirm this with the user first). Wipe both before seeding so record
  counts are exact and the bucket does not accumulate test blobs release over release.
- Use the real `https://sync.nookly.work` server, real test accounts (a throwaway email domain
  like `@resend.dev`'s sandbox addresses), and the real beta key from Heroku config — not a
  local server — so timings and behavior match what a user actually gets.

## Setup

1. **Build the current debug binary**: `cd apps/desktop/src-tauri && cargo build`.
2. **Build a baseline from an older tag** (for upgrade and performance comparisons), in a
   separate git worktree so it doesn't disturb the working tree:
   ```
   git worktree add --detach /tmp/nookly-old <old-tag>
   cd /tmp/nookly-old && bun install --frozen-lockfile
   cd apps/desktop/src-tauri && CARGO_TARGET_DIR=/tmp/nookly-old-target cargo build
   ```
   Remove the worktree when done: `git worktree remove /tmp/nookly-old --force`.
3. **Wipe the server** (only once confirmed the data is disposable):
   - Postgres: `heroku pg:psql -a nookly-sync -c "TRUNCATE <every data table> CASCADE;"`
   - Bucket: list every object version (`ListObjectVersionsCommand`, versioning is on) and
     delete them all — a plain delete only adds a delete marker and leaves the bytes billed and
     recoverable.
4. **Seed a dataset through the CLI**, not by hand: script `nookly cli <type> create` calls
   against a scratch `NOOKLY_DATA_DIR` for every entity type, with relationships, labels, trashed
   rows, and files of varied sizes (small to several MB, plus one deliberately duplicated file to
   check content-addressed dedupe). This is the only way to get a realistic, relationship-rich
   dataset without hand-crafting SQL. Capture a **fingerprint** of the result (row counts + a
   content hash per synced table, device-local columns like `local_path` excluded) before
   touching sync, to diff against later.
5. **Launch each instance** pointed at its own data dir and a fresh vite dev server:
   ```
   NOOKLY_DATA_DIR=/path/to/scratch/data NOOKLY_NO_SEED=1 bun run tauri dev
   ```
   `NOOKLY_NO_SEED=1` skips the built-in dev sample data so only the seeded dataset is present.

## Scripts

The helpers of the first run are in `tools/instance-testing/`. They read secrets from the
environment (the Heroku config of `nookly-sync`, kept in a file outside the repo), never from
the files. Run the TypeScript ones from `apps/server` so `@aws-sdk/client-s3` resolves.

| Script                       | Does                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `seed.ts <dir> <bin> <out>`  | Seeds a data dir through the CLI, writes a manifest with file hashes                   |
| `fp.py <dir> [--json]`       | Fingerprint of a data dir: rows and a content hash per synced table, local columns out |
| `wipe-bucket.ts`             | Deletes every version in `nookly-files` (refuses any other bucket)                     |
| `bucket-check.ts <manifest>` | Every bucket object against the manifest's hashes                                      |
| `sec.py <tokens> <out.json>` | The security probes of the first run, for three accounts' tokens (alpha, beta, other)  |
| `ui.py`, `px.py`, `fill.py`  | `cua-driver` wrappers: click or set a row by regex, pixel click, fill a form field     |

## Driving the app

Use `cua-driver` (see the `cua-driver` skill) against the exact pid/window id of each test
instance — never the production app's. Useful patterns found during this run:

- Pass the same `session` label on every `get_window_state`/`click`/`type_text` call for one
  instance; element tokens from one CLI session are rejected (`stale_element_token`) by another.
- Background `type_text`/`set_value` into an Electron/webview field often returns
  `background_unavailable` or the value does not reach the form's own state. The reliable path
  is a **pixel click to focus** (one `get_window_state` with a screenshot for coordinates, then
  `click` by `x,y`), `cmd+a` + `delete` to clear, then `type_text` with
  `delivery_mode: "foreground"`. This briefly raises the window; harmless for a dev instance.
- A click or set_value on a popover/menu that isn't in the accessibility tree (seen with one
  custom `Display` popover) still works as a **pixel click** read from a screenshot taken in the
  same session.
- Treat every `effect: "unverifiable"` as "sent, not confirmed" and re-read the window rather
  than trusting the call result.
- For timing, read the window once (untimed), fire the click with `post_action_wait: "none"`,
  then poll `get_window_state` in a loop until the expected text appears; the poll itself costs
  ~40-70ms so treat that as the measurement floor, not as the thing being measured.

## What to verify after every sync operation

- **Row-for-row equality**: dump the server's `records` table for the account
  (`tbl, pk, fields, deleted_clock`) and compare against each device's local `sync_rows` table.
  Equal sets, no onlyLocal/onlyServer/differing rows.
- **File integrity**: SHA-256 of every local blob and every bucket object must match the
  manifest recorded at seed time; bucket object count must equal the distinct hash count (content
  dedupe for identical files is expected and fine).
- **Fingerprint diff**: the same per-table hash from setup, recomputed, for any data that should
  not have changed (e.g. a baseline dataset before it ever touches sync).
- **No duplicate entity keys** (`key_prefix`+`key_number`) after two independent devices merge
  into one account — this is the sharpest signal that key renumbering on merge actually works.
- **`sync_conflicts`/`conflicts`** tables for clashes, and that review/resolution in the UI
  propagates the chosen value to every device.

## Server-down and offline scenarios

- `heroku ps:scale web=0 -a nookly-sync` takes the server down cleanly; `web=1` brings it back.
  Time `/health` polling to measure real recovery time.
- Queue edits while down (`sync_dirty` grows), kill `-9` the app mid-burst, restart it, and
  confirm `sync_dirty` still holds exactly what wasn't flushed yet and `pragma integrity_check`
  on the SQLite file is clean. Bring the server back and confirm the queue drains and every
  device converges with no loss and no duplicates.

## Security probing

Authenticated with real test accounts' bearer tokens, against the real server, read-only or
reversible actions only:

- Every protected route with no token, a garbage token, a truncated/uppercased valid token, a
  token in the query string or a cookie: all must be rejected, only the real bearer header works.
- Cross-account: one account's token against another account's blob (by sha-256), record pks,
  sessions, devices, conflicts, and share ids. Also check the account endpoint for anything that
  looks like a secret.
- Oversized bodies, malformed JSON, a batch over the documented cap, deeply nested JSON,
  SQL/script/path-traversal strings as field _values_ (should be stored inertly, never
  interpreted), and a bogus table name.
- Rate limiting: repeat a failing call many times from one spoofed `X-Forwarded-For` value to
  find the real limit, then repeat it again rotating the header value per request — if the
  second run is not limited while the first was, the limiter trusts an untrusted header.
- Never brute-force a real secret (a beta key, a password) even behind a rate-limit bypass; the
  bypass itself is the finding; stop there.

## Cleanup

- Stop every test instance (`kill <pid>`), remove the baseline worktree, delete scratch data
  directories.
- Decide with the user whether to re-wipe the server and bucket (test data is cheap to recreate
  from the seed script) before release, or leave the accounts for another pass.
