# Settings that are not secret live in production.tfvars. Secrets come from the environment
# (TF_VAR_<name>), from GitHub Actions secrets in CI.

variable "app_name" {
  description = "Heroku app name, unique across Heroku."
  type        = string
}

variable "team" {
  description = "Heroku team that owns the app. Null for a personal app."
  type        = string
  default     = null
}

variable "region" {
  description = "Heroku region of the app and its database: \"eu\" or \"us\"."
  type        = string
  default     = "eu"
}

variable "dyno_size" {
  description = "Dyno size of the web process. Eco sleeps and drops live sync, so Basic or larger."
  type        = string
  default     = "basic"
}

variable "dyno_quantity" {
  description = "Number of web dynos. Each one runs the database migrations on start, so keep 1 unless that is safe."
  type        = number
  default     = 1
}

variable "deployed" {
  description = "Set to true once a first image is released. Heroku only scales a process type that exists."
  type        = bool
  default     = false
}

variable "postgres_plan" {
  description = "Heroku Postgres plan. Standard and up add rollback; move there before real users."
  type        = string
  default     = "essential-0"
}

variable "postgres_version" {
  description = "Postgres major version, as in docker-compose."
  type        = string
  default     = "17"
}

variable "zone_name" {
  description = "The domain, a zone on Cloudflare."
  type        = string
}

variable "server_subdomain" {
  description = "Where the server answers, under zone_name."
  type        = string
  default     = "sync"
}

variable "cloudflare_account_id" {
  description = "Cloudflare account that holds the zone and the R2 bucket."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Zone ID of zone_name on Cloudflare."
  type        = string
}

variable "storage_bucket" {
  description = "R2 bucket for file contents."
  type        = string
  default     = "nookly-files"
}

variable "storage_access_key_id" {
  description = "Access key of an R2 API token with Object Read and Write on storage_bucket."
  type        = string
  sensitive   = true
}

variable "storage_secret_access_key" {
  description = "Secret key of that R2 API token."
  type        = string
  sensitive   = true
}

variable "resend_api_key" {
  description = "Resend API key with sending access, for account emails."
  type        = string
  sensitive   = true
}

variable "resend_region" {
  description = "Region the domain was added in on Resend; it names the bounce mail server."
  type        = string
  default     = "eu-west-1"
}

variable "resend_dkim" {
  description = "The DKIM record's value Resend shows for the domain (resend._domainkey)."
  type        = string
}

variable "extra_config_vars" {
  description = "Further server settings from .env.example (CORS_ORIGINS, LOG_LEVEL, SESSION_TTL_DAYS ...)."
  type        = map(string)
  default     = {}
}

variable "extra_sensitive_config_vars" {
  description = "Further secret settings, such as OAuth client ids and secrets."
  type        = map(string)
  default     = {}
  sensitive   = true
}
