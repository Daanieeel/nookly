//! Driving a debug build from scripts, for end to end checks (`tools/e2e`).
//!
//! Only in a debug build, and only when `NOOKLY_AUTOMATION_PORT` is set: a listener
//! on 127.0.0.1 takes a script in a request body, runs it in the main window's
//! webview, and answers with what it returned, as JSON. A release build has none of
//! this: `start` compiles to nothing and the command refuses.

use std::collections::HashMap;
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};

type Waiters = Arc<Mutex<HashMap<u64, Sender<String>>>>;

fn waiters() -> &'static Waiters {
    static WAITERS: OnceLock<Waiters> = OnceLock::new();
    WAITERS.get_or_init(Default::default)
}

/// Where a script's result comes back from the webview.
#[tauri::command]
pub fn automation_result(id: u64, value: String) {
    if !cfg!(debug_assertions) {
        return;
    }
    if let Some(sender) = waiters().lock().ok().and_then(|mut w| w.remove(&id)) {
        sender.send(value).ok();
    }
}

#[cfg(debug_assertions)]
pub fn start(app: &tauri::AppHandle) {
    use std::io::{BufRead, BufReader, Read, Write};
    use tauri::Manager;
    let Ok(port) = std::env::var("NOOKLY_AUTOMATION_PORT") else {
        return;
    };
    let Ok(listener) = std::net::TcpListener::bind(format!("127.0.0.1:{port}")) else {
        eprintln!("automation: couldn't listen on {port}");
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        let mut next = 0u64;
        for stream in listener.incoming().flatten() {
            let mut reader = BufReader::new(stream);
            let mut length = 0usize;
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                    break;
                }
                if let Some(v) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                    length = v.trim().parse().unwrap_or(0);
                }
            }
            let mut body = vec![0u8; length];
            if reader.read_exact(&mut body).is_err() {
                continue;
            }
            let script = String::from_utf8_lossy(&body).into_owned();
            next += 1;
            let id = next;
            let (tx, rx) = channel();
            if let Ok(mut w) = waiters().lock() {
                w.insert(id, tx);
            }
            let wrapped = format!(
                "(async () => {{ let out; try {{ out = {{ ok: true, value: await (async () => {{ {script} }})() }}; }} catch (e) {{ out = {{ ok: false, error: String(e && e.stack || e) }}; }} await window.__TAURI_INTERNALS__.invoke('automation_result', {{ id: {id}, value: JSON.stringify(out) ?? 'null' }}); }})();"
            );
            let answer = match app.get_webview_window("main") {
                Some(window) if window.eval(&wrapped).is_ok() => rx
                    .recv_timeout(std::time::Duration::from_secs(60))
                    .unwrap_or_else(|_| r#"{"ok":false,"error":"timed out"}"#.into()),
                _ => r#"{"ok":false,"error":"no window"}"#.into(),
            };
            let mut stream = reader.into_inner();
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{answer}",
                answer.len()
            );
            stream.write_all(response.as_bytes()).ok();
        }
    });
}

#[cfg(not(debug_assertions))]
pub fn start(_app: &tauri::AppHandle) {}
