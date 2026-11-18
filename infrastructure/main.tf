# The sync server (apps/server) on Heroku: one container app and its Postgres. File
# contents in an R2 bucket and the DNS on Cloudflare; account emails through Resend.

locals {
  server_host = "${var.server_subdomain}.${var.zone_name}"
  public_url  = "https://${local.server_host}"
  # R2's S3 API for a bucket kept in the EU.
  storage_endpoint = "https://${var.cloudflare_account_id}.eu.r2.cloudflarestorage.com"
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
    MAIL_FROM   = "Nookly <no-reply@${var.zone_name}>"
    # Heroku Postgres only takes TLS; the server's Postgres client reads PGSSL.
    PGSSL               = "require"
    S3_ENDPOINT         = local.storage_endpoint
    S3_REGION           = "auto"
    S3_BUCKET           = cloudflare_r2_bucket.files.name
    S3_FORCE_PATH_STYLE = "true"
  }, var.extra_config_vars)

  sensitive_vars = merge({
    AUTH_SECRET          = random_password.auth_secret.result
    SMTP_URL             = "smtps://resend:${var.resend_api_key}@smtp.resend.com:465"
    S3_ACCESS_KEY_ID     = var.storage_access_key_id
    S3_SECRET_ACCESS_KEY = var.storage_secret_access_key
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

# File contents by SHA-256, kept in the EU. R2 has no object versioning; contents are
# never overwritten with something else (the key is the content's hash).
resource "cloudflare_r2_bucket" "files" {
  account_id   = var.cloudflare_account_id
  name         = var.storage_bucket
  jurisdiction = "eu"

  lifecycle {
    prevent_destroy = true
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

# Resend's records for sending as the domain: bounces and SPF on `send`, and the DKIM key.
resource "cloudflare_dns_record" "resend_mx" {
  zone_id  = var.cloudflare_zone_id
  name     = "send.${var.zone_name}"
  type     = "MX"
  content  = "feedback-smtp.${var.resend_region}.amazonses.com"
  priority = 10
  ttl      = 1
}

resource "cloudflare_dns_record" "resend_spf" {
  zone_id = var.cloudflare_zone_id
  name    = "send.${var.zone_name}"
  type    = "TXT"
  content = "\"v=spf1 include:amazonses.com ~all\""
  ttl     = 1
}

resource "cloudflare_dns_record" "resend_dkim" {
  zone_id = var.cloudflare_zone_id
  name    = "resend._domainkey.${var.zone_name}"
  type    = "TXT"
  content = "\"${var.resend_dkim}\""
  ttl     = 1
}

# Reports only for now; tighten to quarantine once mail is seen to pass.
resource "cloudflare_dns_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc.${var.zone_name}"
  type    = "TXT"
  content = "\"v=DMARC1; p=none;\""
  ttl     = 1
}
