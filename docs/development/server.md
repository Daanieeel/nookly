# Server

`apps/server`: Bun, Elysia, Postgres through Drizzle. How to run and deploy it is in its [README](../../apps/server/README.md); the sync rules are in [the sync protocol](sync-protocol.md).

| Part     | Where        | Notes                                                                                                                                                                                                                                      |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accounts | `src/auth`   | argon2id passwords, 15 minute JWT access tokens, rotating refresh tokens (a reused one revokes the session), one session per device, email verification and password reset links, account deletion removes every server row of the account |
| Sync     | `src/sync`   | push, pull, WebSocket notices; records stored as JSON per `(owner, table, pk)`; sequence numbers per account under a row lock, so they follow commit order                                                                                 |
| Sharing  | `src/shares` | invites by email or link, viewer or editor, accept, decline, leave, revoke; sharing needs a confirmed email                                                                                                                                |
| Mail     | `src/mail`   | `console` (development), `smtp` (production)                                                                                                                                                                                               |
| Limits   | `src/app.ts` | rate limits per IP and account, 8 MB bodies, CORS limited to the desktop app's origins, logs without bodies, headers or query strings                                                                                                      |

## What a shared page brings

A recipient gets the page's own row, its blocks and its settings, nothing else: no relationships, labels, other entities, or the owner's Space. The page sits in a Space only the recipient has, "Shared by <email>", with its Notes module. An editor may change the title, the icon and the blocks; moving, trashing or retyping the page stays with the owner. Pinning a shared page stays on the recipient's side.

## Designed, not built: sharing a whole Space

A share would name a Space instead of an entity, and carry every row whose entity lives in it, plus the Space row itself. Records already carry their entity (`scope`), so the server would match on the entities' `space_id`. Left out for now: a Space holds far more than a person usually means to share, and a page level share covers the case people ask for.
