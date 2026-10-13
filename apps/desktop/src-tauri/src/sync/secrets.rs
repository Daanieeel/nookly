//! The sync account's refresh token, in the OS keychain. The short lived access
//! token only ever lives in memory.

use crate::error::AppResult;

pub(crate) const SERVICE: &str = "nookly-sync";
const USER: &str = "refresh-token";

pub fn set(token: &str) -> AppResult<()> {
    crate::keychain::set(SERVICE, USER, token)
}

pub fn get() -> AppResult<Option<String>> {
    crate::keychain::get(SERVICE, USER)
}

pub fn delete() -> AppResult<()> {
    crate::keychain::delete(SERVICE, USER)
}
