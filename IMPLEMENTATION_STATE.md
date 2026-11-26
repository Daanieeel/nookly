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
- [x] L. Lint, format, typecheck, tests, `cargo test`, duplication.
- [x] M. Live check, push, open PR (https://github.com/Daanieeel/nookly/pull/333, not merged).

## Second part: authentication strategy (asked 2026-11-25, mid work)

Implement **all** of `AUTHENTICATION_STRATEGY.md` (the user's untracked file at the repo root; read it, do not edit or delete it), its TODO section included. Do after A to M.

- [x] N. Explore current auth, break the strategy into tasks here.
- [x] N1. Server migration 0007 (additive, with backfill) and its test.
- [x] N2. Server: no implicit linking, provider emails stored, `session.provider`, primary set for the first provider.
- [x] N3. Server: second step for every account and provider (challenge at provider redeem), old apps answered `update_required`.
- [x] N4. Server: re check within 10 minutes; two factor management needs it instead of a password.
- [x] N5. Server: list, link, unlink, set primary; add, change, remove Nookly Signin; change emails with a code; sign in and reset by login email.
- [x] N6. Shared API client, schemas, runtime gate.
- [x] N7. Desktop UI.
- [x] N8. Phone and tablet UI.
- [x] N9. TODO tests: `/reset-password.js` 500, flaky `apps/web/src/components/hero/stage.test.tsx` (passes in 0.3 s alone; the two whole tour tests now get 30 s, since they time out only on a loaded machine).
- [x] N10. Docs, DECISIONS (D107 to D109), changelog, whats-new (highlight cards), then L and M again for everything.

### Design (decided while exploring)

- Columns: `auth_account.email`, `email_verified`, `email_chosen` (person changed it, a provider sign in must not overwrite it); `auth_user.primary_provider`; `auth_session.provider`, `reauthed_at`, `pending` (browser session of a provider sign in on a 2FA account, opens nothing). Unique `lower(email)` among `credential` rows. Backfill: account email = user email unless placeholder, primary = earliest account, session provider = primary where the account has one provider.
- `auth_user.email` stays the primary's email (and `users.email` changes with it in one transaction).
- better-auth: `accountLinking.disableImplicitLinking`. Its own linking is **not** used: it links at the provider callback, which would let a sent link attach a victim's provider to an attacker's account. Our link flow takes the provider callback itself and links only at redeem (ticket from the browser + secret from the app).
- A new account whose email any account already uses is refused (`user.validateUserInfo`), `account_not_linked` for providers. Providers without an email get a placeholder via `mapProfileToUser`.
- `/v1/auth/*` becomes an allowlist: better-auth's own account routes (link, unlink, update user, delete user) would skip the re check.
- Second step after a provider: delete the session, make a challenge in better-auth's own format (verification `2fa-<random>` plus `2fa-attempts-...`, HMAC signed like its cookie), so `/auth/two-factor/*` finishes it.
- New apps send `?auth=2` on requests (a custom header would break the desktop's CORS preflight against an older server). Without it, an account lacking two factor gets 403 `update_required` "Update Nookly to continue." on sign in and sync.
- Required only where `REQUIRE_TWO_FACTOR` is on (production), now for every account.
- Re check: password or provider confirmation, plus a second step code when two factor is on; a session younger than 10 minutes counts.
- A major version bump is **not** done; tell the user the old app lockout is a breaking change.

## Third part: fixes from trying it (2026-11-26)

- [x] O. App froze during a first sync: downloaded files were read (OCR) while holding the database lock, and the sync commands ran on the window's thread.
- [x] P. File failures showed "[object Object]"; an older server showed "Not found." for sign in methods.
- [x] Q. "Keep a local copy" is a `CheckboxGroup` with a new `warning` variant, phone too.
- [x] R. Files get their own server limit (3000 a minute); the apps wait as long as a refusal says.
- [x] S. Signing in again no longer re sends files the account still holds (came with H).
- Local checks before the full Rust run: lint, format, typecheck, duplication, server tests pass; `bun run test` had two `ShortcutsTab` timeouts on a loaded machine (pass alone). Full `cargo test` and clippy left to CI.
- Adding a provider needs a 1.6.0 server with provider keys. Production is 1.5.6; the local `.env` has no keys and `PUBLIC_URL` names another port than `PORT`.

## Fourth part: release risks (2026-11-26)

- [x] T. Data loss found before merge: records left by 1.0.3 on a device that moved accounts counted as proof, so sign out deleted files the account never got. Sign out now needs the account to be seen holding the contents (`held:<sha256>` in `sync_meta`, no schema change); recorded files without it are asked about once and sent if missing. Also fixes an old copy overwriting a newer one after joining an account again (came with H).
- Right after the update, a signed in device shows its files as waiting while each is asked about, and a sign out in that time backs the device up first.
- Release order: desktop `v1.1.0` first, `server-v1.6.0` once all builds are published. Back up the database before the server tag.

## Notes

- Checks 2026-11-25: lint, format, typecheck, duplication (0.18%), whats-new, version, `bun run test` (all 6 packages) pass. `cargo test`: 1585 pass; `search_stays_within_its_budget_on_20000_entities` misses its time budget only while every test runs at once (passes alone, search code untouched).
- N8: phone `screens/{RecheckPrompt,SecondStepForm,SignOutSheet,NewPasswordFields,BrowserWait,account-change,recheck}`, `screens/settings/{SignInMethods,SignInSheets}`; shared wording in `packages/shared/src/api/sign-in.ts` (desktop uses it too). `Sheet` got `locked` (required two factor, no way out but setup or Sign Out) and `stacked` (the confirm question floats over the sheet it came from). Phone sign out now offers "Keep a local copy" like the desktop. Phone tests 1103 pass. Not tried in the simulator yet.
- N7: `features/sync/{RecheckDialog,SecondStepForm,SignInMethods,SignInDialogs,SignOutDialog,NewPasswordFields,useAccountChange,recheck-gate}`; sign in methods moved from the calendar Connections page to the account page (replaces the Change password row). Frontend tests all pass (3765).
- N6: `SyncRuntime.linkProvider`, `disconnectProvider` (keeps local data when it signs this device out), gate refresh on `two_factor_required`. UI calls: `api.signInMethods/recheck/sendRecheckCode/setPrimary/sendEmailCode/changeEmail/addPassword/setPassword`, `needsRecheck(error)`, provider sign in may throw `TwoFactorRequiredError`.
- N1 to N5: server done, 245 server tests pass. New files `apps/server/src/auth/{emails,codes,challenge,recheck,sign-in-methods}.ts`, `test/{sign-in-methods,sign-in-migration}.test.ts`, `test/fake-providers.ts`. Shared client already has the new calls; `runSecurityAction` no longer takes a password. N9 first half fixed: the reset page script failed on folder names with spaces.
- Live check 2026-11-25: `/health` 1.5.6, `/docs` 404, Heroku app `nookly-sync` has `TRUST_PROXY=true`, `TRUSTED_PROXY_HOPS` unset (default 1).
- B to F: `SyncStatus.held`, `MigrationState.heldItems`, `pushResponse.serverTime`; held changes stay in `sync_dirty` (in memory skip list in `SyncClient`, retried after 1 h, on edit, on app start). `SyncEngine.requeueSetAside` only re-sends rows still exactly like the stored copy; a set aside row edited since keeps its old conflict entry (cannot be told apart from an undone edit).
- G: wording lives in `packages/shared/src/sync/copy.ts`.
- H, I: `BlobSync.confirmed()` / `remove()`, `BlobPlatform.remove` (Rust `blob_remove`, phone `data/remove-stored.ts`); `blob_files` records are kept on leaving an account but prove nothing (see T), a row without a local path always downloads. Old copies of replaced files are not tracked, so they stay on disk. Backups (`pre-sync-backups`, `kept-backups`) stay too: tell the user.
- J: `BlobPlatform.size` and `upload(..., onSent)`, `BlobProgress.pass*`, `MigrationState.fileBytes(Sent)`, wording in `copy.ts`. A file gone from disk no longer keeps the first sync open.
