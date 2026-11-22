# The sync server (apps/server) on Heroku: one container app and its Postgres. File
# contents in a Scaleway bucket, the DNS on Cloudflare, account emails through Resend.

locals {
  server_host = "${var.server_subdomain}.${var.zone_name}"
  public_url  = "https://${local.server_host}"
  # Scaleway Object Storage's S3 API in the bucket's region.
  storage_endpoint = "https://s3.${var.storage_region}.scw.cloud"
}

# Server -----------------------------------------------------------------------------

resource "heroku_app" "server" {
  name   = var.app_name
  region = var.region
  # The image is built from apps/server/Dockerfile (.github/workflows/server.yml).
  stack = "container"
  # Automatic TLS certificates for the server's domain.
  acm = true

  dynamic "organization" {
    for_each = var.team == null ? [] : [var.team]
    content {
      name = organization.value
    }
  }

  # Deleting the app deletes its database with it.
  lifecycle {
    prevent_destroy = true
  }
}

# Attached as DATABASE, so Heroku sets DATABASE_URL on the app and keeps it current
# through credential rotations and failovers.
resource "heroku_addon" "database" {
  app_id = heroku_app.server.id
  plan   = "heroku-postgresql:${var.postgres_plan}"
  config = {
    version = var.postgres_version
  }

  # Every account's synced data. Never let a plan or a typo destroy it.
  lifecycle {
    prevent_destroy = true
  }
}

# Signs sessions. Made once; replacing it signs every device out.
resource "random_password" "auth_secret" {
  length  = 64
  special = false
}

resource "heroku_domain" "server" {
  app_id   = heroku_app.server.id
  hostname = local.server_host
}

resource "heroku_app_config_association" "server" {
  app_id = heroku_app.server.id

  vars = merge({
    NODE_ENV    = "production"
    PUBLIC_URL  = local.public_url
    TRUST_PROXY = "true"
    MAILER      = "smtp"
    MAIL_FROM   = "Nookly <hello@${var.zone_name}>"
    # Heroku Postgres only takes TLS; the server's Postgres client reads PGSSL.
    PGSSL               = "require"
    S3_ENDPOINT         = local.storage_endpoint
    S3_REGION           = var.storage_region
    S3_BUCKET           = scaleway_object_bucket.files.name
    S3_FORCE_PATH_STYLE = "true"
  }, var.extra_config_vars)

  sensitive_vars = merge({
    AUTH_SECRET          = random_password.auth_secret.result
    BETA_KEY             = var.beta_key
    SMTP_URL             = "smtps://resend:${var.resend_api_key}@smtp.resend.com:465"
    S3_ACCESS_KEY_ID     = scaleway_iam_api_key.server.access_key
    S3_SECRET_ACCESS_KEY = scaleway_iam_api_key.server.secret_key
  }, var.extra_sensitive_config_vars)
}

# Heroku only scales a process type an image has been released for.
resource "heroku_formation" "web" {
  count    = var.deployed ? 1 : 0
  app_id   = heroku_app.server.id
  type     = "web"
  size     = var.dyno_size
  quantity = var.dyno_quantity

  depends_on = [heroku_addon.database, heroku_app_config_association.server]
}

# Files ------------------------------------------------------------------------------

# File contents by SHA-256, in the EU. Versioned, as the server expects: an overwritten or
# deleted object can be recovered. Deleting an account removes its versions too.
resource "scaleway_object_bucket" "files" {
  name = var.storage_bucket

  versioning {
    enabled = true
  }

  lifecycle_rule {
    id                                     = "abort-incomplete-uploads"
    enabled                                = true
    abort_incomplete_multipart_upload_days = 7
  }

  lifecycle {
    prevent_destroy = true
  }
}

# The bucket was made by hand in the console, so the first apply adopts it instead of
# failing on a name that is taken. Once in the state this does nothing.
import {
  to = scaleway_object_bucket.files
  id = "${var.storage_region}/${var.storage_bucket}@${var.scaleway_project_id}"
}

# The server's own key: objects in this project only, no buckets, no other service.
resource "scaleway_iam_application" "server" {
  name        = "${var.app_name}-server"
  description = "The sync server on Heroku, reading and writing file contents."
}

resource "scaleway_iam_policy" "server" {
  name           = "${var.app_name}-server-files"
  application_id = scaleway_iam_application.server.id

  rule {
    project_ids = [var.scaleway_project_id]
    permission_set_names = [
      "ObjectStorageBucketsRead",
      "ObjectStorageObjectsRead",
      "ObjectStorageObjectsWrite",
      "ObjectStorageObjectsDelete",
    ]
  }
}

resource "scaleway_iam_api_key" "server" {
  application_id     = scaleway_iam_application.server.id
  default_project_id = var.scaleway_project_id
  description        = "S3 keys of ${var.app_name}, set on the Heroku app."

  # Scaleway gives the key a one year expiry of its own. Without this every plan would
  # replace the key and restart the server. Rotate it before it runs out (README.md).
  lifecycle {
    ignore_changes        = [expires_at]
    create_before_destroy = true
  }
}

# DNS --------------------------------------------------------------------------------

# Not proxied: Heroku issues the certificate itself (ACM), which needs to see the CNAME.
resource "cloudflare_dns_record" "server" {
  zone_id = var.cloudflare_zone_id
  name    = local.server_host
  type    = "CNAME"
  content = heroku_domain.server.cname
  proxied = false
  ttl     = 1
}

# Resend's own records (`send` CNAME, DKIM key) are set by Resend's Cloudflare connect,
# outside Terraform.

# Monitoring only for now (`p=none`); tighten to quarantine once the reports sent to hello@
# show mail passing. hello@ needs an Email Routing rule (Cloudflare) to receive them.
resource "cloudflare_dns_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc.${var.zone_name}"
  type    = "TXT"
  content = "\"v=DMARC1; p=none; rua=mailto:hello@${var.zone_name}; fo=1;\""
  ttl     = 1
}

# Website ------------------------------------------------------------------------------

# nookly.work: the static site from apps/web, built and uploaded by the website workflow
# (wrangler pages deploy). Terraform owns the project and its domains, not its deploys.
resource "cloudflare_pages_project" "website" {
  account_id        = var.cloudflare_account_id
  name              = var.website_project
  production_branch = "main"
}

resource "cloudflare_pages_domain" "website" {
  for_each     = toset([var.zone_name, "www.${var.zone_name}"])
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.website.name
  name         = each.key
}

# Proxied, so the apex can point at Pages (Cloudflare flattens the CNAME).
resource "cloudflare_dns_record" "website" {
  for_each = toset([var.zone_name, "www.${var.zone_name}"])
  zone_id  = var.cloudflare_zone_id
  name     = each.key
  type     = "CNAME"
  content  = cloudflare_pages_project.website.subdomain
  proxied  = true
  ttl      = 1
}
