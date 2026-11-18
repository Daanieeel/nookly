//! Secrets in the OS keychain, never in a file: one entry per `(service, user)`.

use crate::error::{AppError, AppResult};

fn entry(service: &str, user: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(service, user).map_err(keychain_error)
}

pub fn set(service: &str, user: &str, secret: &str) -> AppResult<()> {
    entry(service, user)?
        .set_password(secret)
        .map_err(keychain_error)
}

pub fn get(service: &str, user: &str) -> AppResult<Option<String>> {
    match entry(service, user)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(keychain_error(e)),
    }
}

pub fn delete(service: &str, user: &str) -> AppResult<()> {
    match entry(service, user)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(keychain_error(e)),
    }
}

fn keychain_error(e: keyring::Error) -> AppError {
    AppError::Remote(format!("Couldn't access the system keychain: {e}"))
}
