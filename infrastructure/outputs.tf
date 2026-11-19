output "app_name" {
  description = "Heroku app name, for the deploy workflow."
  value       = heroku_app.server.name
}

output "server_url" {
  description = "The address both apps use as their server."
  value       = local.public_url
}

output "storage_endpoint" {
  description = "Scaleway's S3 API for the files bucket."
  value       = local.storage_endpoint
}

output "website_project" {
  description = "Cloudflare Pages project the website workflow deploys to."
  value       = cloudflare_pages_project.website.name
}
