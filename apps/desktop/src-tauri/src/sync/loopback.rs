//! Where the browser goes back to after signing in with another account (Google, GitHub,
//! Notion). The server sends it to a one shot listener on this computer's loopback address,
//! the way desktop apps are meant to receive an OAuth return (RFC 8252). It works in every
//! build, installed or not, because it needs no `nookly://` link registered with the system.
//!
//! What comes back is a one time code the server only hands over for a secret this app
//! keeps, so a request from anything else on the machine opens nothing.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// How long a sign in can take: a person finding their password, a second factor.
pub const WAIT: Duration = Duration::from_secs(5 * 60);

/// What the browser shows once it is back: the look of the pages the server shows for an
/// email link (`apps/server/src/pages.ts`), kept in a file of its own.
const PAGE: &str = include_str!("return-page.html");

/// One sign in waiting for its browser.
pub struct Listener {
    pub port: u16,
    result: Mutex<Receiver<String>>,
    stop: Arc<AtomicBool>,
}

impl Listener {
    /// Starts listening on a free loopback port, for at most `wait`.
    pub fn bind(wait: Duration) -> std::io::Result<Self> {
        let socket = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        socket.set_nonblocking(true)?;
        let port = socket.local_addr()?.port();
        let (send, result) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&stop);
        std::thread::spawn(move || {
            let deadline = Instant::now() + wait;
            while !flag.load(Ordering::Relaxed) && Instant::now() < deadline {
                match socket.accept() {
                    Ok((stream, _)) => {
                        if let Some(address) = answer(stream, port) {
                            let _ = send.send(address);
                            return;
                        }
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(40)),
                }
            }
        });
        Ok(Self {
            port,
            result: Mutex::new(result),
            stop,
        })
    }

    /// The address the browser came back to, or `None` when the sign in was cancelled or
    /// took too long.
    pub fn wait(&self) -> Option<String> {
        // A poisoned lock only means another wait panicked; the receiver is still good.
        let result = self
            .result
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        result.recv().ok()
    }

    pub fn cancel(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

impl Drop for Listener {
    fn drop(&mut self) {
        self.cancel();
    }
}

/// Answers one request. Only a `GET /auth` that names this very address as its host counts:
/// anything else (a favicon, a page on another site asking the browser to talk to a
/// loopback port under another name) is turned away and the wait goes on.
fn answer(mut stream: TcpStream, port: u16) -> Option<String> {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut head = Vec::new();
    let mut chunk = [0_u8; 1024];
    while head.len() < 8192 && !head.windows(4).any(|w| w == b"\r\n\r\n") {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => head.extend_from_slice(&chunk[..n]),
        }
    }
    let text = String::from_utf8_lossy(&head);
    let mut lines = text.split("\r\n");
    let target = lines
        .next()
        .and_then(|line| line.strip_prefix("GET "))
        .and_then(|rest| rest.split(' ').next());
    let host_ok = lines.any(|line| {
        line.split_once(':').is_some_and(|(name, value)| {
            let value = value.trim();
            name.eq_ignore_ascii_case("host")
                && (value == format!("127.0.0.1:{port}") || value == format!("localhost:{port}"))
        })
    });
    let query = target
        .filter(|_| host_ok)
        .and_then(|t| t.strip_prefix("/auth?"))
        .filter(|q| !q.is_empty());
    let (status, body) = if query.is_some() {
        ("200 OK", PAGE)
    } else {
        ("404 Not Found", "")
    };
    let reply = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(reply.as_bytes());
    query.map(|q| format!("http://127.0.0.1:{port}/auth?{q}"))
}

/// The sign in in progress, if any. Starting another ends the one before it.
#[derive(Default)]
pub struct LoopbackState(Mutex<Option<Arc<Listener>>>);

impl LoopbackState {
    fn slot(&self) -> std::sync::MutexGuard<'_, Option<Arc<Listener>>> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    pub fn start(&self, wait: Duration) -> std::io::Result<u16> {
        let listener = Arc::new(Listener::bind(wait)?);
        let port = listener.port;
        if let Some(previous) = self.slot().replace(listener) {
            previous.cancel();
        }
        Ok(port)
    }

    pub fn current(&self) -> Option<Arc<Listener>> {
        self.slot().clone()
    }

    pub fn cancel(&self) {
        if let Some(listener) = self.slot().take() {
            listener.cancel();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(port: u16, head: &str) -> String {
        let mut stream = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        stream.write_all(head.as_bytes()).unwrap();
        let mut reply = String::new();
        stream.read_to_string(&mut reply).unwrap();
        reply
    }

    fn get(port: u16, path: &str, host: &str) -> String {
        request(
            port,
            &format!("GET {path} HTTP/1.1\r\nHost: {host}\r\n\r\n"),
        )
    }

    #[test]
    fn listens_on_the_loopback_address_only() {
        let listener = Listener::bind(Duration::from_secs(5)).unwrap();
        assert!(listener.port >= 1024);
        // The socket is on 127.0.0.1: reachable there, and nothing else was asked for.
        assert!(TcpStream::connect((Ipv4Addr::LOCALHOST, listener.port)).is_ok());
        listener.cancel();
    }

    #[test]
    fn hands_over_the_address_the_browser_came_back_to() {
        let listener = Listener::bind(Duration::from_secs(5)).unwrap();
        let port = listener.port;
        let reply = get(port, "/auth?code=abc123", &format!("127.0.0.1:{port}"));
        assert!(reply.starts_with("HTTP/1.1 200"), "{reply}");
        assert!(reply.contains("You're back in Nookly"));
        // Dressed like the server's pages: the brand, the badge and the legal links.
        assert!(reply.contains("class=\"brand\"") && reply.contains("class=\"badge\""));
        assert!(reply.contains("https://nookly.work/terms"));
        assert_eq!(
            listener.wait().as_deref(),
            Some(format!("http://127.0.0.1:{port}/auth?code=abc123").as_str())
        );
    }

    #[test]
    fn also_takes_the_reason_a_sign_in_failed() {
        let listener = Listener::bind(Duration::from_secs(5)).unwrap();
        let port = listener.port;
        get(
            port,
            "/auth?error=signup_disabled",
            &format!("localhost:{port}"),
        );
        assert_eq!(
            listener.wait().as_deref(),
            Some(format!("http://127.0.0.1:{port}/auth?error=signup_disabled").as_str())
        );
    }

    #[test]
    fn turns_other_requests_away_and_keeps_waiting() {
        let listener = Listener::bind(Duration::from_secs(5)).unwrap();
        let port = listener.port;
        let own = format!("127.0.0.1:{port}");
        assert!(get(port, "/favicon.ico", &own).starts_with("HTTP/1.1 404"));
        assert!(get(port, "/auth", &own).starts_with("HTTP/1.1 404"));
        assert!(get(port, "/auth?code=x", "evil.example").starts_with("HTTP/1.1 404"));
        assert!(request(port, "POST /auth?code=x HTTP/1.1\r\n\r\n").starts_with("HTTP/1.1 404"));
        get(port, "/auth?code=real", &own);
        assert_eq!(
            listener.wait().as_deref(),
            Some(format!("http://127.0.0.1:{port}/auth?code=real").as_str())
        );
    }

    #[test]
    fn cancelling_ends_the_wait_with_nothing() {
        let listener = Arc::new(Listener::bind(Duration::from_secs(30)).unwrap());
        let waiting = Arc::clone(&listener);
        let handle = std::thread::spawn(move || waiting.wait());
        std::thread::sleep(Duration::from_millis(100));
        listener.cancel();
        assert_eq!(handle.join().unwrap(), None);
    }

    #[test]
    fn gives_up_when_nobody_comes() {
        let listener = Listener::bind(Duration::from_millis(150)).unwrap();
        assert_eq!(listener.wait(), None);
    }

    #[test]
    fn starting_another_sign_in_ends_the_first() {
        let state = LoopbackState::default();
        state.start(Duration::from_secs(30)).unwrap();
        let first = state.current().unwrap();
        let waiting = std::thread::spawn(move || first.wait());
        std::thread::sleep(Duration::from_millis(100));
        let second = state.start(Duration::from_secs(30)).unwrap();
        assert_eq!(waiting.join().unwrap(), None);
        assert_eq!(state.current().unwrap().port, second);
        state.cancel();
        assert!(state.current().is_none());
    }
}
