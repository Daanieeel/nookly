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
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # The state holds every secret (AUTH_SECRET, the storage and Resend keys), so it lives in
  # a private R2 bucket, never in the repository. The bucket and the account's endpoint are
  # given at init (`-backend-config`, README.md); its keys in AWS_ACCESS_KEY_ID and
  # AWS_SECRET_ACCESS_KEY. CI runs one apply at a time (the workflow's concurrency).
  backend "s3" {
    key                         = "production/terraform.tfstate"
    region                      = "auto"
    use_path_style              = true
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}

# Read HEROKU_API_KEY and CLOUDFLARE_API_TOKEN from the environment.
provider "heroku" {}

provider "cloudflare" {}
