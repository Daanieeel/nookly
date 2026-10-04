#![no_main]
//! A backup file is untrusted input: whoever hands one over (a download, a shared
//! drive) controls every byte. Inspecting it may refuse it, never panic.
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    nookly_lib::fuzz_support::inspect_backup(data);
});
