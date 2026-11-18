# Infrastructure

The sync server (`apps/server`) on Heroku, its files on Scaleway Object Storage (Paris), DNS on Cloudflare, account emails through Resend. Terraform here; the workflows in `.github/workflows/` run it. The diagram is in [`infra.drawio`](infra.drawio).

| Resource                        | What                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| `heroku_app.server`             | container app `nookly-sync` (EU), certificate for `sync.nookly.work` |
| `heroku_addon.database`         | Heroku Postgres `essential-0`, Postgres 17, sets `DATABASE_URL`      |
| `heroku_app_config_association` | server settings, generated `AUTH_SECRET`                             |
| `heroku_formation.web`          | one `basic` dyno, once `deployed = true`                             |
| `scaleway_object_bucket.files`  | `nookly-files` in `fr-par`, versioned, made by hand and adopted      |
| `scaleway_iam_*.server`         | the server's own key: objects in the project, nothing else           |
| `cloudflare_dns_record.*`       | `sync` CNAME to Heroku (not proxied), DMARC                          |

The app, the database and the bucket have `prevent_destroy`: Terraform refuses any plan that deletes them. About 12 USD a month on Heroku: `basic` 7, `essential-0` 5. Scaleway about 0.015 EUR per GB a month.

## Releases

Each part has its own version and tag. Only the desktop makes GitHub Releases, since its updater reads the latest one.

| Tag             | Version from               | Runs                                                     |
| --------------- | -------------------------- | -------------------------------------------------------- |
| `v1.2.3`        | `apps/desktop` (as before) | `release.yml`: installers, a GitHub Release              |
| `server-v1.2.3` | `apps/server/package.json` | `server.yml`: image to Heroku, waits for it on `/health` |
| `mobile-v1.2.3` | `apps/mobile/app.json`     | `mobile.yml`: EAS production build, sent to TestFlight   |

A merge to `main` that changes `infrastructure/` applies it (`infrastructure.yml`); a pull request shows the plan. Nothing reaches Heroku, Cloudflare or Scaleway until the repository variable `DEPLOY_ENABLED` is `true`; until then the workflows only check and build.

## Secrets and variables (GitHub, repository settings)

| Name                       | Kind     | What                                                         |
| -------------------------- | -------- | ------------------------------------------------------------ |
| `HEROKU_API_KEY`           | secret   | `heroku authorizations:create -d "nookly ci"`                |
| `CLOUDFLARE_API_TOKEN`     | secret   | token with Zone DNS Edit on nookly.work                      |
| `SCW_ACCESS_KEY`           | secret   | key of a Scaleway IAM application for Terraform (below)      |
| `SCW_SECRET_KEY`           | secret   |                                                              |
| `RESEND_API_KEY`           | secret   | Resend, sending access                                       |
| `EXPO_TOKEN`               | secret   | expo.dev, Access tokens                                      |
| `CLOUDFLARE_ZONE_ID`       | variable | set                                                          |
| `SCALEWAY_ORGANIZATION_ID` | variable | Scaleway console, Organization settings                      |
| `SCALEWAY_PROJECT_ID`      | variable | the project holding the buckets                              |
| `TF_STATE_BUCKET`          | variable | `nookly-terraform-state` (made by hand, versioned, `fr-par`) |
| `DEPLOY_ENABLED`           | variable | `true` to let the workflows deploy                           |

## First deploy

1. Scaleway: in the project, make the bucket `nookly-terraform-state` in `fr-par` with versioning on. Make an IAM application `terraform` with `ObjectStorageFullAccess` on the project and `IAMManager` on the organization (it creates the server's key), and an API key for it into `SCW_ACCESS_KEY` and `SCW_SECRET_KEY`.
1. Resend: add `nookly.work` in region `eu-west-1` and let it set its DNS records through Cloudflare.
1. Add the secrets above, set `DEPLOY_ENABLED` to `true`, run Infrastructure by hand (Actions, Run workflow) or merge to `main`.
1. Tag the server: `git tag server-v1.0.0 && git push origin server-v1.0.0`.
1. Set `deployed = true` in `production.tfvars` and merge: Terraform takes over the dyno's size.
1. Schedule backups once: `heroku pg:backups:schedule DATABASE_URL --at "02:00 Europe/Berlin" -a nookly-sync`.

The server runs its database migrations on start, so it stays at one dyno.

The server's Scaleway key expires a year after it was made (first one: 2027-11-18). Before that, replace it locally (see below) with `terraform apply -var-file=production.tfvars -replace=scaleway_iam_api_key.server`: the new key goes onto the Heroku app and the server restarts.

## Locally

```sh
cd infrastructure
terraform init -backend=false && terraform validate   # what CI checks on a pull request
```

A plan against the real state needs the state keys and every `TF_VAR_*` the workflow sets.

## Phone app (EAS)

`apps/mobile/eas.json`: `development` (dev client), `development-simulator`, `preview` (internal), `production` (App Store, build number kept by EAS). Release builds use `https://sync.nookly.work`. Before the first production build, once: `cd apps/mobile && eas credentials` (signing, App Store Connect API key for uploads), and add the app in App Store Connect.
