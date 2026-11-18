terraform {
  required_version = ">= 1.6"

  required_providers {
    heroku = {
      source  = "heroku/heroku"
      version = "~> 5.4"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.92"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # The state holds every secret (AUTH_SECRET, the storage and Resend keys), so it lives in
  # a private, versioned Scaleway bucket, never in the repository. The bucket is given at
  # init (`-backend-config`, README.md); the Scaleway key in AWS_ACCESS_KEY_ID and
  # AWS_SECRET_ACCESS_KEY. CI runs one apply at a time (the workflow's concurrency).
  backend "s3" {
    key                         = "production/terraform.tfstate"
    region                      = "fr-par"
    endpoints                   = { s3 = "https://s3.fr-par.scw.cloud" }
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

# Read HEROKU_API_KEY, CLOUDFLARE_API_TOKEN, SCW_ACCESS_KEY and SCW_SECRET_KEY from the
# environment.
provider "heroku" {}

provider "cloudflare" {}

provider "scaleway" {
  organization_id = var.scaleway_organization_id
  project_id      = var.scaleway_project_id
  region          = var.storage_region
}
