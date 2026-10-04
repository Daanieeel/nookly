#![no_main]
//! The CLI's argument parser and field coercion, over arbitrary argv. Agents
//! drive this surface with free text, so it must refuse bad input, never panic.
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let Ok(text) = std::str::from_utf8(data) else { return };
    // One argument per line, so the fuzzer can build flags, fields and values.
    let argv: Vec<String> = text.lines().map(str::to_string).collect();
    nookly_lib::fuzz_support::cli_arguments(&argv);
});
