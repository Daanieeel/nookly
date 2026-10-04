#![no_main]
//! The search indexer opens every Office file a user imports (docx, pptx, xlsx are
//! zip packages of XML). Malformed ones must yield no text, never panic.
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let Some((kind, body)) = data.split_first() else { return };
    let ext = ["docx", "pptx", "xlsx"][usize::from(*kind) % 3];
    nookly_lib::fuzz_support::extract_office_text(body, ext);
});
