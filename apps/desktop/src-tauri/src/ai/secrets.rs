//! Provider API keys in the OS keychain, never in `nookly.db`, the AI provider
//! store file, or any export — byte-for-byte the same pattern as
//! `external_calendars::secrets`, keyed by each provider config's own id
//! instead of a fixed enum, since a user can add more than one custom
//! provider (PLAN §3.3).

use crate::error::{AppError, AppResult};

const SERVICE: &str = "nookly-ai-providers";

fn entry(provider_id: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, provider_id).map_err(keychain_error)
}

pub fn set(provider_id: &str, secret: &str) -> AppResult<()> {
    entry(provider_id)?.set_password(secret).map_err(keychain_error)
}

pub fn get(provider_id: &str) -> AppResult<Option<String>> {
    match entry(provider_id)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(keychain_error(e)),
    }
}

pub fn delete(provider_id: &str) -> AppResult<()> {
    match entry(provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(keychain_error(e)),
    }
}

fn keychain_error(e: keyring::Error) -> AppError {
    AppError::Remote(format!("Couldn't access the system keychain: {e}"))
}
