#![no_main]
//! An iCalendar feed comes from whatever server the user pointed the app at.
//! Expanding it, recurrence rules included, must never panic or hang.
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let Ok(text) = std::str::from_utf8(data) else { return };
    nookly_lib::fuzz_support::expand_ics(text);
});
