//! Runs the real `nookly cli` binary to check what unit tests can't: exit codes,
//! JSON on stdout for success, JSON on stderr for errors. A debug build honors
//! `NOOKLY_DATA_DIR`, so every run gets its own throwaway database.

use std::process::{Command, Output};

fn data_dir() -> std::path::PathBuf {
    // Tests run in parallel threads of one process, and the clock is only as fine as
    // the platform makes it (microseconds on macOS), so a counter keeps every
    // directory, and so every database, to one test.
    static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "nookly-cli-process-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    std::fs::remove_dir_all(&dir).ok();
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn run(dir: &std::path::Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_nookly"))
        .arg("cli")
        .args(args)
        .env("NOOKLY_DATA_DIR", dir)
        .output()
        .unwrap()
}

fn json(bytes: &[u8]) -> serde_json::Value {
    serde_json::from_slice(bytes)
        .unwrap_or_else(|e| panic!("not JSON ({e}): {}", String::from_utf8_lossy(bytes)))
}

#[test]
fn success_exits_zero_with_compact_json_on_stdout() {
    let dir = data_dir();
    let out = run(&dir, &["help"]);
    assert!(out.status.success());
    assert!(out.stderr.is_empty());
    let text = String::from_utf8(out.stdout.clone()).unwrap();
    assert_eq!(
        text.trim_end().lines().count(),
        1,
        "piped output is compact"
    );
    assert!(json(&out.stdout)["entityCommands"].is_object());
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn errors_exit_one_with_kind_and_message_on_stderr() {
    let dir = data_dir();
    let out = run(&dir, &["task", "get", "no-such-id"]);
    assert_eq!(out.status.code(), Some(1));
    assert!(out.stdout.is_empty());
    let err = json(&out.stderr);
    assert_eq!(
        err["error"]["kind"],
        "NotFound",
        "stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(err["error"]["message"]
        .as_str()
        .unwrap()
        .contains("no-such-id"));

    let out = run(&dir, &["unicorn"]);
    assert_eq!(out.status.code(), Some(1));
    assert_eq!(json(&out.stderr)["error"]["kind"], "InvalidInput");
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn a_write_persists_across_processes_and_a_failed_one_does_not() {
    let dir = data_dir();
    let space = json(
        &run(
            &dir,
            &["space", "create", "--name", "Ü ✨ space", "--color", "#000"],
        )
        .stdout,
    );
    let space_id = space["id"].as_str().unwrap();
    let ok = run(
        &dir,
        &[
            "note",
            "create",
            "--space",
            space_id,
            "--title",
            "Grüße mit Leerzeichen",
        ],
    );
    assert!(ok.status.success());
    let bad = run(
        &dir,
        &[
            "note", "create", "--space", space_id, "--title", "Dup", "--yes",
        ],
    );
    assert_eq!(bad.status.code(), Some(1));
    let listed = json(&run(&dir, &["note", "list", "--space", space_id]).stdout);
    assert_eq!(listed["count"], 1);
    assert_eq!(listed["items"][0]["title"], "Grüße mit Leerzeichen");
    std::fs::remove_dir_all(dir).ok();
}
