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
