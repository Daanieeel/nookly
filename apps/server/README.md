# Nookly sync server

Optional. Nookly works fully without it; the server lets an account sync its devices and share pages. Bun, Elysia, Postgres.

## Run locally

From the repository root:

```sh
cp .env.example .env     # every value works for development
bun install
docker compose up -d     # Postgres (5433) and MinIO (9000, console 9001)
bun run stack            # applies migrations, runs the server with watch mode
```

The server listens on `http://localhost:3000` (`PORT` in `.env`), prints emails (confirm email, password reset, invites) to its log, and serves the API docs at `/docs`. `bun run dev` starts the server, the desktop app and the mobile app together.

- Desktop: `bun run tauri dev`, then the cloud button in the titlebar, Sign in or I'm new here. The server address is `http://localhost:3000`.
- Phone or tablet: `bun run dev:expo`, press `i` for the iOS simulator. The simulator reaches `localhost`; a real device needs this computer's address in the server field on the sign in screen.
- Without Docker: start a Postgres and MinIO (or leave `S3_*` out, then files do not sync) and set `DATABASE_URL`.

## Configure

Environment variables, listed with their defaults in [`.env.example`](../../.env.example). Required: `DATABASE_URL` (built from the Postgres values when unset), `AUTH_SECRET` (32 characters or more). In production also set `PUBLIC_URL`, `MAILER=smtp` with `SMTP_URL`, `MAIL_FROM` and the `S3_*` values. OAuth providers turn on when their client id and secret are set.

## Deploy (one VPS)

1. Point a domain's DNS at the server, open ports 80 and 443.
2. Copy `.env.example` to `apps/server/.env`, set `DOMAIN`, `POSTGRES_PASSWORD`, `AUTH_SECRET`, the `S3_*` values and the SMTP settings.
3. From `apps/server`: `docker compose -f docker-compose.prod.yml up -d --build`

Caddy gets and renews the TLS certificate. Back up the `pgdata` volume. Update with `git pull` and the same command.

## Test

```sh
cd apps/server && bun test
```

The tests run against a real Postgres: `TEST_DATABASE_URL` when set, otherwise one started with Docker (Testcontainers).

## Change the database

Edit `src/db/schema.ts`, then `bun run db:generate` and commit the new file in `drizzle/`. Synced data is stored generically, so a new table or field on the desktop needs no server change.
