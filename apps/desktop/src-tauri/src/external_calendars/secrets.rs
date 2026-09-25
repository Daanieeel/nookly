//! Provider credentials in the OS keychain, never in the cache file: the Google
//! refresh token and the Apple app specific password.

use super::Provider;
use crate::error::{AppError, AppResult};

const SERVICE: &str = "nookly-external-calendars";

fn entry(provider: Provider) -> AppResult<keyring::Entry> {
    let user = match provider {
        Provider::Google => "google",
        Provider::Icloud => "icloud",
    };
    keyring::Entry::new(SERVICE, user).map_err(keychain_error)
}

pub fn set(provider: Provider, secret: &str) -> AppResult<()> {
    entry(provider)?
        .set_password(secret)
        .map_err(keychain_error)
}

pub fn get(provider: Provider) -> AppResult<Option<String>> {
    match entry(provider)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(keychain_error(e)),
    }
}

pub fn delete(provider: Provider) -> AppResult<()> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(keychain_error(e)),
    }
}

fn keychain_error(e: keyring::Error) -> AppError {
    AppError::Remote(format!("Couldn't access the system keychain: {e}"))
}
