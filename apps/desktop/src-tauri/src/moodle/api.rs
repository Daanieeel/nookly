//! Moodle's REST web service, read only. Every request is a `POST` to
//! `webservice/rest/server.php` (the token travels in the body, never in a
//! URL) or a `GET` of a file on the same site.
//!
//! Nothing here builds an error from a request URL: those can carry the token.

use super::site::Site;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::path::Path;
use std::time::Duration;
use url::Url;

/// What went wrong, so callers can tell a site that is out of reach (the cache
/// can stand in) from one that refuses the token (it can't).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApiError {
    /// The token is wrong or expired. Sign in again.
    Auth(String),
    /// The site could not be reached.
    Offline(String),
    /// The site answered, but not with what was asked for.
    Server(String),
}

impl ApiError {
    pub fn message(&self) -> &str {
        match self {
            ApiError::Auth(m) | ApiError::Offline(m) | ApiError::Server(m) => m,
        }
    }
}

impl From<ApiError> for crate::error::AppError {
    fn from(e: ApiError) -> Self {
        crate::error::AppError::Remote(e.message().to_string())
    }
}

/// A files bigger than this is not fetched into memory as text.
const MAX_TEXT_BYTES: usize = 2 * 1024 * 1024;

pub struct Client {
    site: Site,
    token: String,
    http: reqwest::Client,
}

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        // A redirect off the site must not carry anything to another host.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let same_host = attempt
                .previous()
                .first()
                .is_some_and(|first| first.host_str() == attempt.url().host_str());
            if same_host && attempt.previous().len() < 5 {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .unwrap_or_default()
}

fn transport(e: reqwest::Error) -> ApiError {
    let e = e.without_url();
    if e.is_timeout() {
        ApiError::Offline("Moodle took too long to answer.".into())
    } else if e.is_connect() || e.is_request() {
        ApiError::Offline("Couldn't reach Moodle.".into())
    } else {
        ApiError::Server("Moodle sent something unexpected.".into())
    }
}

/// `name[0]=a&name[1]=b`, the way Moodle reads a list parameter.
pub fn list_param(name: &str, values: &[i64]) -> Vec<(String, String)> {
    values
        .iter()
        .enumerate()
        .map(|(i, v)| (format!("{name}[{i}]"), v.to_string()))
        .collect()
}

pub fn param(name: &str, value: impl ToString) -> (String, String) {
    (name.to_string(), value.to_string())
}

impl Client {
    pub fn new(site: Site, token: String) -> Client {
        Client {
            site,
            token,
            http: http(),
        }
    }

    pub fn site(&self) -> &Site {
        &self.site
    }

    /// Calls one web service function and reads its answer as `T`.
    pub async fn call<T: DeserializeOwned>(
        &self,
        function: &str,
        params: Vec<(String, String)>,
    ) -> Result<T, ApiError> {
        let mut form = vec![
            param("wstoken", &self.token),
            param("wsfunction", function),
            param("moodlewsrestformat", "json"),
        ];
        form.extend(params);
        let response = self
            .http
            .post(self.site.page("webservice/rest/server.php"))
            .form(&form)
            .send()
            .await
            .map_err(transport)?;
        if !response.status().is_success() {
            return Err(ApiError::Server(format!(
                "Moodle answered with an error ({}).",
                response.status().as_u16()
            )));
        }
        let body = response.bytes().await.map_err(transport)?;
        let value: Value = serde_json::from_slice(&body)
            .map_err(|_| ApiError::Server("That address is not a Moodle site.".into()))?;
        if let Some(error) = value.as_object().filter(|o| o.contains_key("exception")) {
            return Err(describe(function, error));
        }
        serde_json::from_value(value)
            .map_err(|_| ApiError::Server("Moodle answered in a way Nookly can't read.".into()))
    }

    /// The URL of a file on the site with the token added. Files are only
    /// fetched from the site itself.
    fn file_url(&self, url: &str) -> Result<Url, ApiError> {
        let mut url =
            Url::parse(url).map_err(|_| ApiError::Server("That file has no address.".into()))?;
        if !self.site.owns(&url) {
            return Err(ApiError::Server(
                "That file is not on your Moodle site. Open it in Moodle instead.".into(),
            ));
        }
        // Moodle serves web service files from `webservice/pluginfile.php`.
        let path = url
            .path()
            .replacen("/pluginfile.php", "/webservice/pluginfile.php", 1);
        if !url.path().contains("/webservice/") {
            url.set_path(&path);
        }
        url.query_pairs_mut().append_pair("token", &self.token);
        Ok(url)
    }

    async fn get_file(&self, url: &str) -> Result<reqwest::Response, ApiError> {
        let response = self
            .http
            .get(self.file_url(url)?)
            .send()
            .await
            .map_err(transport)?;
        match response.status().as_u16() {
            200..=299 => Ok(response),
            401 | 403 => Err(ApiError::Auth(
                "Moodle won't give you that file. Reconnect, or open it in Moodle.".into(),
            )),
            404 => Err(ApiError::Server("Moodle no longer has that file.".into())),
            code => Err(ApiError::Server(format!(
                "Moodle answered with an error ({code})."
            ))),
        }
    }

    /// Saves a file to `dest`, through a `.partial` file so a failed download
    /// never leaves half a file behind. Returns its size.
    pub async fn download(&self, url: &str, dest: &Path) -> Result<u64, ApiError> {
        let mut response = self.get_file(url).await?;
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(io)?;
        }
        let partial = dest.with_extension("partial");
        let mut out = std::fs::File::create(&partial).map_err(io)?;
        let mut size = 0u64;
        let result: Result<(), ApiError> = async {
            use std::io::Write;
            while let Some(chunk) = response.chunk().await.map_err(transport)? {
                size += chunk.len() as u64;
                out.write_all(&chunk).map_err(io)?;
            }
            Ok(())
        }
        .await;
        drop(out);
        if let Err(e) = result {
            let _ = std::fs::remove_file(&partial);
            return Err(e);
        }
        std::fs::rename(&partial, dest).map_err(io)?;
        Ok(size)
    }

    /// A small text file (a Moodle page's body, say).
    pub async fn text(&self, url: &str) -> Result<String, ApiError> {
        let bytes = self.get_file(url).await?.bytes().await.map_err(transport)?;
        if bytes.len() > MAX_TEXT_BYTES {
            return Err(ApiError::Server(
                "That file is too big to show here.".into(),
            ));
        }
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }
}

fn io(e: std::io::Error) -> ApiError {
    ApiError::Server(format!("Couldn't save the file: {e}"))
}

fn describe(function: &str, error: &serde_json::Map<String, Value>) -> ApiError {
    let code = error
        .get("errorcode")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match code {
        "invalidtoken" | "accessexception" if is_token_problem(error) => {
            ApiError::Auth("Your Moodle sign in expired. Connect again.".into())
        }
        "invalidtoken" => ApiError::Auth("Your Moodle sign in expired. Connect again.".into()),
        "servicenotavailable" | "webservicesnotenabled" | "restwsnotenabled" => ApiError::Server(
            "This Moodle site has the mobile app service turned off, so Nookly can't read it."
                .into(),
        ),
        _ => ApiError::Server(format!(
            "Moodle doesn't allow Nookly to read this ({function}{}).",
            if code.is_empty() {
                String::new()
            } else {
                format!(": {code}")
            }
        )),
    }
}

fn is_token_problem(error: &serde_json::Map<String, Value>) -> bool {
    error
        .get("message")
        .and_then(Value::as_str)
        .is_some_and(|m| m.to_ascii_lowercase().contains("token"))
}

#[cfg(test)]
mod tests {
    use super::super::test_server::{start, Response};
    use super::*;
    use serde_json::json;

    fn run<F: std::future::Future>(f: F) -> F::Output {
        tauri::async_runtime::block_on(f)
    }

    #[test]
    fn calls_a_function_with_the_token_in_the_body() {
        let moodle = start(|_| Response::json(json!({ "fullname": "Ada" })));
        let client = Client::new(moodle.site.clone(), "secret".into());
        let got: Value =
            run(client.call("core_webservice_get_site_info", vec![param("a", 1)])).unwrap();
        assert_eq!(got["fullname"], "Ada");
        let requests = moodle.requests.lock().unwrap();
        let request = &requests[0];
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/webservice/rest/server.php");
        assert_eq!(request.form["wstoken"], "secret");
        assert_eq!(request.form["wsfunction"], "core_webservice_get_site_info");
        assert_eq!(request.form["moodlewsrestformat"], "json");
        assert_eq!(request.form["a"], "1");
        assert!(request.query.is_empty(), "the token must not be in the URL");
    }

    #[test]
    fn list_parameters_are_indexed() {
        assert_eq!(
            list_param("courseids", &[4, 9]),
            vec![param("courseids[0]", 4), param("courseids[1]", 9)]
        );
    }

    #[test]
    fn an_invalid_token_asks_to_connect_again() {
        let moodle = start(|_| {
            Response::json(json!({
                "exception": "moodle_exception",
                "errorcode": "invalidtoken",
                "message": "Invalid token - token not found",
            }))
        });
        let client = Client::new(moodle.site.clone(), "old".into());
        let err = run(client.call::<Value>("x", vec![])).unwrap_err();
        assert!(matches!(err, ApiError::Auth(_)), "{err:?}");
    }

    #[test]
    fn a_disabled_service_is_explained() {
        let moodle = start(|_| {
            Response::json(
                json!({ "exception": "x", "errorcode": "servicenotavailable", "message": "m" }),
            )
        });
        let client = Client::new(moodle.site.clone(), "t".into());
        let err = run(client.call::<Value>("x", vec![])).unwrap_err();
        assert!(err.message().contains("turned off"), "{err:?}");
    }

    #[test]
    fn a_refused_function_names_itself_but_never_the_token() {
        let moodle = start(|_| {
            Response::json(
                json!({ "exception": "x", "errorcode": "accessexception", "message": "no" }),
            )
        });
        let client = Client::new(moodle.site.clone(), "TOKEN123".into());
        let err = run(client.call::<Value>("mod_forum_get_forums_by_courses", vec![])).unwrap_err();
        assert!(err.message().contains("mod_forum_get_forums_by_courses"));
        assert!(!err.message().contains("TOKEN123"));
    }

    #[test]
    fn something_that_is_not_moodle_is_not_trusted() {
        let moodle = start(|_| Response::bytes(200, b"<html>hello</html>"));
        let client = Client::new(moodle.site.clone(), "t".into());
        let err = run(client.call::<Value>("x", vec![])).unwrap_err();
        assert!(err.message().contains("not a Moodle site"), "{err:?}");
        let moodle = start(|_| Response::bytes(500, b""));
        let client = Client::new(moodle.site.clone(), "t".into());
        assert!(matches!(
            run(client.call::<Value>("x", vec![])),
            Err(ApiError::Server(_))
        ));
    }

    #[test]
    fn an_unreachable_site_is_offline_and_leaks_nothing() {
        let site = Site::unchecked(Url::parse("http://127.0.0.1:1/").unwrap());
        let client = Client::new(site, "TOKEN123".into());
        let err = run(client.call::<Value>("x", vec![])).unwrap_err();
        assert!(matches!(err, ApiError::Offline(_)), "{err:?}");
        assert!(!format!("{err:?}").contains("TOKEN123"));
    }

    #[test]
    fn downloads_a_file_with_the_token_through_the_web_service_path() {
        let moodle = start(|r| {
            if r.path
                .ends_with("/webservice/pluginfile.php/5/mod/file.pdf")
                && r.query["token"] == "t"
            {
                Response::bytes(200, b"%PDF")
            } else {
                Response::bytes(404, b"")
            }
        });
        let client = Client::new(moodle.site.clone(), "t".into());
        let url = moodle
            .site
            .page("pluginfile.php/5/mod/file.pdf")
            .to_string();
        let dir = std::env::temp_dir().join(format!("nookly-moodle-{}", crate::db::new_id()));
        let dest = dir.join("a/file.pdf");
        assert_eq!(run(client.download(&url, &dest)).unwrap(), 4);
        assert_eq!(std::fs::read(&dest).unwrap(), b"%PDF");
        assert!(!dest.with_extension("partial").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_failed_download_leaves_no_file() {
        let moodle = start(|_| Response::bytes(404, b""));
        let client = Client::new(moodle.site.clone(), "t".into());
        let dir = std::env::temp_dir().join(format!("nookly-moodle-{}", crate::db::new_id()));
        let dest = dir.join("file.pdf");
        let url = moodle
            .site
            .page("webservice/pluginfile.php/1/a")
            .to_string();
        assert!(run(client.download(&url, &dest)).is_err());
        assert!(!dest.exists() && !dest.with_extension("partial").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn never_sends_the_token_to_another_host() {
        let moodle = start(|_| Response::bytes(200, b"x"));
        let client = Client::new(moodle.site.clone(), "TOKEN123".into());
        let err =
            run(client.text("https://evil.example/webservice/pluginfile.php/1/a")).unwrap_err();
        assert!(err.message().contains("not on your Moodle site"), "{err:?}");
        assert!(moodle.requests.lock().unwrap().is_empty());
    }
}
