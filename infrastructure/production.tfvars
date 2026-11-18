# Production settings that are not secret. Secrets come from TF_VAR_* (see README.md).
app_name         = "nookly-sync"
region           = "eu"
dyno_size        = "basic"
postgres_plan    = "essential-0"
zone_name        = "nookly.work"
server_subdomain = "sync"
storage_region   = "fr-par"
storage_bucket   = "nookly-files"

# After the first image is released (README.md):
deployed = true
