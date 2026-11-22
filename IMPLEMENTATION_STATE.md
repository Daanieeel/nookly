# Implementation state: sync release hardening

> **Keep working until every item is ticked.** Tick items and update notes after every meaningful step. `NOTES.md` is the user's own file: never edit, format, checkout or restore it. Source: `report/Nookly-Sync-Test-Report.pdf`, procedure in `INSTANCE_TESTING.md`.

Read `AGENTS.md` and `docs/00-index.md` first.

## Ground rules

- Version stays 1.0.0 (unreleased, user publishes Monday). `CHANGELOG.md` and `whats-new.json` fold into the existing 1.0.0 entry.
- Branch: `fix/sync-release-hardening`. Test first for every fix, watch it fail.
- Copy never uses em or en dashes.
- Probe against `sync.nookly.work` only for verification after deploy; do not deploy without the user.

## Tasks

### Server (`apps/server`)

- [x] 1a. NUL byte (`\u0000`) in any synced field: reject or strip in the push schema so it cannot reach Postgres.
- [x] 1b. One bad change must not fail the whole push batch: per change result, others applied.
- [x] 2a. Rate limit client IP: take the router-appended address, not a client-supplied `X-Forwarded-For` entry.
- [x] 2b. Per account sign-in limit on top of per IP.
- [x] 7. `/docs` and `/docs/json` disabled in production.
- [x] 8. Oversized body: server already answers 413 (test added); the probe's connection reset was Python's urllib failing mid upload, not a server bug.
- [x] Clock poisoning: far-future HLC cannot permanently win merges (verify, fix if not).

### Desktop (`apps/desktop`)

- [x] 1c. Client quarantines a change the server keeps rejecting after N retries and shows it, instead of stalling the queue.
- [x] 3b. The "Sign out of this computer?" dialog is a destructive `AlertDialog` (`ConfirmPermanentDialog`), per the user.
- [x] 3. Sign-out "remove from this computer" really deletes the file blobs (or the wording is fixed).
- [x] 4. Device-local columns (`files.local_path`, `source_path`) do not mark rows dirty; `changesWaiting` is accurate.
- [x] 5. Device name uses the hostname; last active refreshes on each sync.
- [x] 6. First sync: parallel blob uploads and real progress.

### Process

- [x] Commit probe scripts (`sec.py`, `fp.py`) under `scripts/` and turn the security cases into server regression tests.
- [x] CHANGELOG / whats-new lines, docs, lint, format, typecheck, tests, `cargo test`.

## Notes

- Server done (tests in `apps/server/test/hardening.test.ts`, `client-ip.test.ts`): new push rejection reasons `invalid-value` and `clock-skew` (protocol.ts); push retries a failed batch change by change; `TRUSTED_PROXY_HOPS` (default 1) takes the XFF entry the proxy appended; per account sign-in limit 20 per 15 min; `API_DOCS` defaults off when `NODE_ENV=production`.
- Deploy notes for the user: Heroku needs `TRUST_PROXY=true` (check `heroku config`, the app is `nookly`; name only, never print values). WebSocket rate limit still keys on the proxy's address (`ws.remoteAddress`), left as is.
- Existing `shares.test.ts` used a clock of year 2286 to prove authorization beats a winning clock; now uses now plus 1 hour.
- Client 1c done (`packages/shared/src/sync/client.ts`, `engine.ts`): rejection `invalid-value` or `clock-skew` is set aside (`engine.quarantine`: row stays, conflict recorded, dirty cleared); a 500 for a whole push is bisected (max 40 requests), a change failing 3 rounds in a row is quarantined; 502/503 are never split.
- Item 4: could not reproduce triggers marking local-only writes as work to send (collect already drops them); real cause was a file downloaded after the round ended leaving a mark until the next round (60 s, or never while the window is in the background). Fix: a downloaded file triggers one more round (`runtime.ts`), test in `runtime.test.ts`.
- Item 6: uploads now 3 at once (`UPLOADS_AT_ONCE`, `blobs.ts`). The first sync screen already counts files and items sent; no byte level progress (one big file still looks still).
- Item 5: device name = `scutil --get ComputerName` / hostname via `sync_computer_name` (Rust, tested) read once at launch in `sync-instance.ts`; "last active" = session `updated_at` touched at most once a minute in `AccountService.authenticate` (better-auth only renews daily; it keys on `expires_at`, so only the time is written).
- Items 3 and 3b: the dialog already was an `AlertDialog`; it is now `severity="destructive"` (red Sign Out) unless "Keep a local copy" is ticked (nothing is removed then). Decision on item 3: files are NOT deleted from disk on sign out (a file that never reached the account would be gone); the dialog now says "Attached files stay in Nookly's folder on this computer". Deleting confirmed-uploaded files is a possible follow-up.
- Probe scripts are in `tools/instance-testing/` (listed in `INSTANCE_TESTING.md`); the security cases are regression tests in `apps/server/test/hardening.test.ts`.
- Checks run on 2026-11-22: lint, format:check, typecheck, `bun run test` (server 130, shared 426, frontend 3647, mobile 998), duplication 0.13%, `cargo test` 1572 pass. `db::search::tests::search_stays_within_its_budget_on_20000_entities` failed once under load during the full run and passes alone (timing test, not touched).
- Not done on purpose: deploy to `nookly-sync` (the user's call; needs `heroku` release from the branch), deleting downloaded files on sign out, byte level first sync progress. Nothing is committed; the branch is `fix/sync-release-hardening`.
