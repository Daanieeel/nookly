//! The sync account's session token, in the OS keychain. A debug build keeps its
//! own entry, so it never signs the installed app in or out.

use crate::error::AppResult;

pub(crate) const SERVICE: &str = if cfg!(debug_assertions) {
    "nookly-sync-dev"
} else {
    "nookly-sync"
};
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
