//! A minimal `text/event-stream` reader shared by every cloud provider.
//!
//! Every vendor's streaming API (Anthropic, OpenAI, Gemini, and any
//! OpenAI-compatible server) sends the same wire shape: lines of `data: {json}`
//! separated by a blank line, terminated either by a final blank line or (the
//! OpenAI family) a literal `data: [DONE]`. No crate is pulled in for this —
//! it's a dozen lines over `reqwest::blocking::Response`, which already
//! implements `std::io::Read`.

use std::io::{BufRead, BufReader, Read};

/// Reads `data: ...` payloads from `body` and calls `on_event` with each
/// JSON-bearing line's content (the raw string after `data: `, not yet
/// parsed — callers know their own vendor's payload shape). Stops at EOF or
/// as soon as `on_event` returns `false`.
pub fn read_event_stream<R: Read>(body: R, mut on_event: impl FnMut(&str) -> bool) {
    let reader = BufReader::new(body);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() {
            continue;
        }
        if data == "[DONE]" {
            break;
        }
        if !on_event(data) {
            break;
        }
    }
}
