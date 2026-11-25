# Implementation state: sync sign out, progress and rejected changes

> Tick items and update notes after every meaningful step. `NOTES.md` is the user's own file: never edit, format, checkout or restore it.

Read `AGENTS.md` and `docs/00-index.md` first.

## Ground rules

- Branch `feat/linked-sign-in-and-sync-hardening`, based on `origin/main`. Commit and push regularly. Open a PR, **do not merge, do not tag, do not deploy**.
- Local `main` has one unpushed commit (`72fc4e5b`, server 1.5.7, web 0.3.5). It is the user's and stays out of this PR.
- Versions: desktop 1.1.0, mobile 1.1.0, server 1.6.0 (minor, covers both parts; one bump per branch).
- Test first for every change, watch it fail. Copy never uses em or en dashes.

## Decisions (answered by the user)

1. Sign out that removes data also deletes files, but only those the account confirmed it has. Unsent files stay.
2. First sync shows byte progress.
3. WebSocket rate limit keys on the real client address.
4. Check the live server. No merge, so no deploy.
5. Rejected changes, for a user who knows nothing of the backend: wrong clock corrected by Nookly itself, NUL characters left out of what is sent, anything else stays waiting, is retried on its own and is explained in plain words. Changes already set aside by 1.0.x are queued again.

## Tasks

- [x] A. Server: WebSocket limits use the client address (`/sync/ws`, `/collab`).
- [x] B. Server and protocol: a push with a `clock-skew` rejection carries the server's time.
- [x] C. Client: correct a wrong clock and resend.
- [x] D. Client: leave NUL characters out of pushed values.
- [x] E. Client: hold refused changes (stay dirty, retried), no conflict entry, first sync can finish.
- [x] F. Client: queue changes set aside by earlier versions again.
- [x] G. UI (desktop and phone): plain words for changes that couldn't sync.
- [x] H. Files download again after sign out and sign in on the same device.
- [x] I. Sign out deletes confirmed files (shared, Rust, phone) and the copy says so.
- [x] J. Byte progress (shared, Rust, desktop UI, phone UI).
- [x] K. Docs, decisions log, versions, CHANGELOG, whats-new.
- [ ] L. Lint, format, typecheck, tests, `cargo test`, duplication.
- [ ] M. Live check, push, open PR.

## Second part: authentication strategy (asked 2026-11-25, mid work)

Implement **all** of `AUTHENTICATION_STRATEGY.md` (the user's untracked file at the repo root; read it, do not edit or delete it), its TODO section included. Do after A to M.

- [ ] N. Explore current auth, break the strategy into tasks here.

## Notes

- Live check 2026-11-25: `/health` 1.5.6, `/docs` 404, Heroku app `nookly-sync` has `TRUST_PROXY=true`, `TRUSTED_PROXY_HOPS` unset (default 1).
- B to F: `SyncStatus.held`, `MigrationState.heldItems`, `pushResponse.serverTime`; held changes stay in `sync_dirty` (in memory skip list in `SyncClient`, retried after 1 h, on edit, on app start). `SyncEngine.requeueSetAside` only re-sends rows still exactly like the stored copy; a set aside row edited since keeps its old conflict entry (cannot be told apart from an undone edit).
- G: wording lives in `packages/shared/src/sync/copy.ts`.
- H, I: `BlobSync.confirmed()` / `remove()`, `BlobPlatform.remove` (Rust `blob_remove`, phone `data/remove-stored.ts`); `engine.disable` blanks `blob_files` so a new account gets the files, a row without a local path always downloads. Old copies of replaced files are not tracked, so they stay on disk. Backups (`pre-sync-backups`, `kept-backups`) stay too: tell the user.
- J: `BlobPlatform.size` and `upload(..., onSent)`, `BlobProgress.pass*`, `MigrationState.fileBytes(Sent)`, wording in `copy.ts`. A file gone from disk no longer keeps the first sync open.
