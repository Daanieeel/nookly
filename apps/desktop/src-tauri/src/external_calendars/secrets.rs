//! Provider credentials in the OS keychain, never in the cache file: the Google
//! refresh token and the Apple app specific password.

use super::Provider;
use crate::error::AppResult;

const SERVICE: &str = "nookly-external-calendars";

fn user(provider: Provider) -> &'static str {
    match provider {
        Provider::Google => "google",
        Provider::Icloud => "icloud",
    }
}

pub fn set(provider: Provider, secret: &str) -> AppResult<()> {
    crate::keychain::set(SERVICE, user(provider), secret)
}

pub fn get(provider: Provider) -> AppResult<Option<String>> {
    crate::keychain::get(SERVICE, user(provider))
}

pub fn delete(provider: Provider) -> AppResult<()> {
    crate::keychain::delete(SERVICE, user(provider))
}
