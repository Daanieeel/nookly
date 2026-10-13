# Nookly sync server

Optional. Nookly works fully without it; the server lets an account sync its devices and share pages. Bun, Elysia, Postgres.

## Run locally

```sh
docker compose -f apps/server/docker-compose.yml up --build
```

The server listens on `http://localhost:3000`, prints emails (verification, reset, invites) to its log, and serves the API docs at `/docs`. Without Docker, start a Postgres yourself and run:

```sh
cd apps/server
DATABASE_URL=postgres://localhost/nookly JWT_SECRET=$(openssl rand -base64 48) bun run dev
```

Migrations run on start. In the desktop app, open Settings, Sync and enter the server address.

## Configure

Environment variables, listed with their defaults in [`.env.example`](.env.example). Required: `DATABASE_URL`, `JWT_SECRET` (32 characters or more). In production also set `PUBLIC_URL`, `MAILER=smtp` with `SMTP_URL`, and `MAIL_FROM`.

## Deploy (one VPS)

1. Point a domain's DNS at the server, open ports 80 and 443.
2. Copy `.env.example` to `apps/server/.env`, set `DOMAIN`, `POSTGRES_PASSWORD`, `JWT_SECRET` and the SMTP settings.
3. From `apps/server`: `docker compose -f docker-compose.prod.yml up -d --build`

Caddy gets and renews the TLS certificate. Back up the `pgdata` volume. Update with `git pull` and the same command.

## Test

```sh
cd apps/server && bun test
```

The tests run against a real Postgres: `TEST_DATABASE_URL` when set, otherwise one started with Docker (Testcontainers).

## Change the database

Edit `src/db/schema.ts`, then `bun run db:generate` and commit the new file in `drizzle/`. Synced data is stored generically, so a new table or field on the desktop needs no server change.
