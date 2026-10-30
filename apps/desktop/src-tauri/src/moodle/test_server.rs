//! A tiny stand in for a Moodle site on `127.0.0.1`, for the client tests.

use super::site::Site;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use url::Url;

#[derive(Debug, Clone)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub query: HashMap<String, String>,
    pub form: HashMap<String, String>,
}

pub struct Response {
    pub status: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
}

impl Response {
    pub fn json(value: serde_json::Value) -> Response {
        Response {
            status: 200,
            content_type: "application/json",
            body: value.to_string().into_bytes(),
        }
    }

    /// Hangs up without answering, like a site that fell off the network.
    pub fn hang_up() -> Response {
        Response {
            status: 0,
            content_type: "",
            body: Vec::new(),
        }
    }

    pub fn bytes(status: u16, body: &[u8]) -> Response {
        Response {
            status,
            content_type: "application/octet-stream",
            body: body.to_vec(),
        }
    }
}

pub struct FakeMoodle {
    pub site: Site,
    pub requests: Arc<Mutex<Vec<Request>>>,
}

/// Starts serving; every request goes to `handler`. The server lives as long as the process.
pub fn start(handler: impl Fn(&Request) -> Response + Send + Sync + 'static) -> FakeMoodle {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let seen = requests.clone();
    let handler = Arc::new(handler);
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let handler = handler.clone();
            let seen = seen.clone();
            std::thread::spawn(move || serve(stream, &*handler, &seen));
        }
    });
    FakeMoodle {
        site: Site::unchecked(Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap()),
        requests,
    }
}

fn serve(
    mut stream: std::net::TcpStream,
    handler: &dyn Fn(&Request) -> Response,
    seen: &Mutex<Vec<Request>>,
) {
    let mut raw = Vec::new();
    let mut buf = [0u8; 4096];
    let header_end = loop {
        let n = stream.read(&mut buf).unwrap_or(0);
        if n == 0 {
            return;
        }
        raw.extend_from_slice(&buf[..n]);
        if let Some(at) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
            break at + 4;
        }
    };
    let head = String::from_utf8_lossy(&raw[..header_end]).to_string();
    let length = head
        .lines()
        .find_map(|l| {
            l.to_ascii_lowercase()
                .strip_prefix("content-length:")
                .map(|v| v.trim().parse::<usize>().unwrap_or(0))
        })
        .unwrap_or(0);
    while raw.len() < header_end + length {
        let n = stream.read(&mut buf).unwrap_or(0);
        if n == 0 {
            break;
        }
        raw.extend_from_slice(&buf[..n]);
    }
    let body = String::from_utf8_lossy(&raw[header_end..]).to_string();
    let mut parts = head.lines().next().unwrap_or_default().split(' ');
    let method = parts.next().unwrap_or_default().to_string();
    let target = parts.next().unwrap_or("/");
    let url = Url::parse(&format!("http://local{target}")).unwrap();
    let request = Request {
        method,
        path: url.path().to_string(),
        query: url.query_pairs().into_owned().collect(),
        form: url::form_urlencoded::parse(body.as_bytes())
            .into_owned()
            .collect(),
    };
    seen.lock().unwrap().push(request.clone());
    let response = handler(&request);
    if response.status == 0 {
        return;
    }
    let _ = write!(
        stream,
        "HTTP/1.1 {} X\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status,
        response.content_type,
        response.body.len()
    );
    let _ = stream.write_all(&response.body);
}
