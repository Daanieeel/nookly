//! Guards the minimum window size from issue #84. Narrower windows made text overlap in the
//! Sessions list and the Calendar.

use std::{fs, path::Path};

use serde_json::Value;

const MIN_WIDTH: u64 = 1200;

#[test]
fn main_window_has_a_minimum_width_that_keeps_text_apart() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    let raw = fs::read_to_string(path).expect("tauri.conf.json is readable");
    let config: Value = serde_json::from_str(&raw).expect("tauri.conf.json is valid JSON");
    let min_width = config["app"]["windows"][0]["minWidth"]
        .as_u64()
        .expect("the main window sets minWidth");
    assert!(
        min_width >= MIN_WIDTH,
        "minWidth {min_width} is below {MIN_WIDTH}"
    );
}
