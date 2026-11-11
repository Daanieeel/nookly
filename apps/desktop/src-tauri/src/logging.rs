//! Nookly's log file. Everything that goes wrong (and the big steps that go right, like a
//! migration or a backup) is written to `logs/nookly.log` in the app data folder, so there is
//! something to look at when a person reports a problem.
//!
//! The log never holds what people write in Nookly. Only ids, counts, durations and error
//! messages go in. It is capped: when `nookly.log` reaches half of [`LOG_BUDGET`], it becomes
//! `nookly.log.1` (replacing the older one) and a fresh file starts, so the two together stay
//! under the budget. `NOOKLY_LOG` sets the detail (`debug`, `trace`, or a full filter such as
//! `nookly_lib=debug`); the default is `info`.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// The most disk space the log files take together.
pub const LOG_BUDGET: u64 = 10 * 1024 * 1024;

/// Folder inside the app data folder that holds the log files.
pub const LOG_DIR: &str = "logs";

const LOG_FILE: &str = "nookly.log";
const OLD_LOG_FILE: &str = "nookly.log.1";

/// The most `crash.log` may hold. Older records are dropped first.
pub const CRASH_LOG_LIMIT: usize = 128 * 1024;

/// How long a command may wait for the database before it is worth a warning.
pub const SLOW_LOCK_WAIT: std::time::Duration = std::time::Duration::from_millis(100);

pub fn log_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(LOG_DIR)
}

/// A log file that starts a new one when it gets too big.
pub struct RotatingFile {
    dir: PathBuf,
    file: File,
    written: u64,
    limit: u64,
}

impl RotatingFile {
    /// Opens (creating the folder and file if needed) and carries on in the existing file.
    pub fn open(dir: &Path, limit: u64) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join(LOG_FILE))?;
        let written = file.metadata()?.len();
        Ok(Self {
            dir: dir.to_path_buf(),
            file,
            written,
            limit,
        })
    }

    fn rotate(&mut self) -> io::Result<()> {
        self.file.flush()?;
        fs::rename(self.dir.join(LOG_FILE), self.dir.join(OLD_LOG_FILE))?;
        self.file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.dir.join(LOG_FILE))?;
        self.written = 0;
        Ok(())
    }
}

impl Write for RotatingFile {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.written > 0 && self.written + buf.len() as u64 > self.limit {
            self.rotate()?;
        }
        let n = self.file.write(buf)?;
        self.written += n as u64;
        Ok(n)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

/// The writer the logger asks for on every event: one shared file behind a lock.
#[derive(Clone)]
struct SharedLog(Arc<Mutex<RotatingFile>>);

impl Write for SharedLog {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self.0.lock() {
            Ok(mut file) => file.write(buf),
            // Logging must never stop the app: a poisoned log just drops the line.
            Err(_) => Ok(buf.len()),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self.0.lock() {
            Ok(mut file) => file.flush(),
            Err(_) => Ok(()),
        }
    }
}

fn filter() -> tracing_subscriber::EnvFilter {
    tracing_subscriber::EnvFilter::try_from_env("NOOKLY_LOG")
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"))
}

/// Starts writing the log under `app_data_dir`. A folder that cannot be written means no
/// log, never a failed launch.
pub fn init(app_data_dir: &Path) {
    let file = match RotatingFile::open(&log_dir(app_data_dir), LOG_BUDGET / 2) {
        Ok(file) => file,
        Err(e) => {
            eprintln!("Couldn't open the log file: {e}");
            return;
        }
    };
    let shared = SharedLog(Arc::new(Mutex::new(file)));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter())
        .with_ansi(false)
        .with_writer(move || shared.clone())
        .try_init();
}

/// Appends `record` to the file at `path`, dropping the oldest lines first so the file never
/// holds more than `limit` bytes.
pub fn append_capped(path: &Path, record: &str, limit: usize) -> io::Result<()> {
    let existing = fs::read_to_string(path).unwrap_or_default();
    let mut text = existing;
    text.push_str(record);
    if text.len() > limit {
        let mut cut = text.len() - limit;
        while !text.is_char_boundary(cut) {
            cut += 1;
        }
        // Start at the next whole line, so no record begins halfway.
        if let Some(newline) = text[cut..].find('\n') {
            cut += newline + 1;
        }
        text.drain(..cut);
    }
    fs::write(path, text)
}

/// Where a frontend message came from, so it reads like the Rust ones.
const FRONTEND_TARGET: &str = "nookly_frontend";

/// Writes a line from the interface to the log. `level` is `error`, `warn`, `info` or
/// `debug`; anything else is `info`. The text is cut so one message cannot flood the file.
pub fn log_frontend(level: &str, scope: &str, message: &str) {
    const MAX: usize = 500;
    let message: String = message.chars().take(MAX).collect();
    match level {
        "error" => tracing::error!(target: FRONTEND_TARGET, scope, "{message}"),
        "warn" => tracing::warn!(target: FRONTEND_TARGET, scope, "{message}"),
        "debug" => tracing::debug!(target: FRONTEND_TARGET, scope, "{message}"),
        _ => tracing::info!(target: FRONTEND_TARGET, scope, "{message}"),
    }
}

/// Runs `run` with a logger that keeps everything (down to `debug`) in memory, and
/// returns what was logged. For tests that check a warning was written.
#[cfg(test)]
pub(crate) fn capture_logs(run: impl FnOnce()) -> String {
    #[derive(Clone, Default)]
    struct Capture(Arc<Mutex<Vec<u8>>>);

    impl Write for Capture {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    let capture = Capture::default();
    let writer = capture.clone();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_ansi(false)
        .with_writer(move || writer.clone())
        .finish();
    tracing::subscriber::with_default(subscriber, run);
    let bytes = capture.0.lock().unwrap().clone();
    String::from_utf8(bytes).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("nookly-logging-{}", crate::db::new_id()))
    }

    fn dir_size(dir: &Path) -> u64 {
        fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.metadata().unwrap().len())
            .sum()
    }

    #[test]
    fn the_log_files_stay_within_the_budget_and_keep_the_newest_lines() {
        let dir = temp_dir();
        let half = 1_000;
        let mut log = RotatingFile::open(&dir, half).unwrap();
        for n in 0..500 {
            log.write_all(format!("line number {n:04}\n").as_bytes())
                .unwrap();
        }
        log.flush().unwrap();
        assert!(dir_size(&dir) <= half * 2, "size {}", dir_size(&dir));
        let current = fs::read_to_string(dir.join(LOG_FILE)).unwrap();
        assert!(current.contains("line number 0499"));
        let old = fs::read_to_string(dir.join(OLD_LOG_FILE)).unwrap();
        assert!(
            !old.contains("line number 0000"),
            "the oldest lines are gone"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reopening_continues_the_same_file_instead_of_replacing_it() {
        let dir = temp_dir();
        writeln!(RotatingFile::open(&dir, 10_000).unwrap(), "first run").unwrap();
        writeln!(RotatingFile::open(&dir, 10_000).unwrap(), "second run").unwrap();
        let text = fs::read_to_string(dir.join(LOG_FILE)).unwrap();
        assert_eq!(text, "first run\nsecond run\n");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_single_line_bigger_than_the_cap_is_still_written() {
        let dir = temp_dir();
        let mut log = RotatingFile::open(&dir, 10).unwrap();
        // The logger writes each event in one piece, so does the test.
        log.write_all(format!("{}\n", "x".repeat(100)).as_bytes())
            .unwrap();
        let text = fs::read_to_string(dir.join(LOG_FILE)).unwrap();
        assert_eq!(text.len(), 101);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_crash_log_is_capped_and_drops_the_oldest_records_first() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("crash.log");
        for n in 0..100 {
            append_capped(&path, &format!("record {n:03} é\n"), 200).unwrap();
        }
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.len() <= 200);
        assert!(text.ends_with("record 099 é\n"));
        assert!(
            text.starts_with("record "),
            "no record starts halfway: {text}"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_small_crash_log_is_only_appended_to() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("crash.log");
        append_capped(&path, "one\n", 1_000).unwrap();
        append_capped(&path, "two\n", 1_000).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "one\ntwo\n");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn frontend_messages_reach_the_log_at_their_level_and_are_cut() {
        let text = capture_logs(|| {
            log_frontend("error", "query", "boom");
            log_frontend("debug", "ignored", "quiet");
            log_frontend("nonsense", "scope", &"y".repeat(5_000));
        });
        assert!(text.contains("ERROR"), "{text}");
        assert!(text.contains("boom"));
        assert!(text.contains("DEBUG"));
        assert!(text.contains("INFO"));
        assert!(!text.contains(&"y".repeat(501)));
    }
}
