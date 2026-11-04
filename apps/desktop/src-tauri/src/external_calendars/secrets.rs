//! Provider credentials in the OS keychain, never in the cache file: the Google
//! refresh token, the Apple app specific password and the Moodle calendar link
//! (its token is part of the URL).

use super::Provider;
use crate::error::{AppError, AppResult};

const SERVICE: &str = "nookly-external-calendars";

/// The real app keeps its entries exactly where they are. A build installed next to it has
/// its own, so connecting or disconnecting a calendar there never changes the real app's.
fn service() -> String {
    service_for(&crate::db::identifier())
}

fn service_for(identifier: &str) -> String {
    if identifier == "com.nookly.app" {
        SERVICE.to_string()
    } else {
        format!("{SERVICE}-{identifier}")
    }
}

fn entry(provider: Provider) -> AppResult<keyring::Entry> {
    let user = match provider {
        Provider::Google => "google",
        Provider::Icloud => "icloud",
        Provider::Moodle => "moodle",
    };
    keyring::Entry::new(&service(), user).map_err(keychain_error)
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

#[cfg(test)]
mod tests {
    use super::service_for;

    #[test]
    fn the_real_app_keeps_its_keychain_entries() {
        assert_eq!(service_for("com.nookly.app"), "nookly-external-calendars");
    }

    #[test]
    fn another_build_gets_its_own() {
        assert_eq!(
            service_for("com.nookly.app.dev"),
            "nookly-external-calendars-com.nookly.app.dev"
        );
    }
}
