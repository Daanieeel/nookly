//! Moodle as Nookly sees it: one connected site, read only.
//!
//! Nothing here is an entity. The connection lives in `moodle.json`, the token
//! in the OS keychain, the last answers in `moodle-cache/` (rebuilt on demand,
//! never backed up) and downloaded files in `moodle-files/`, which disconnecting
//! never touches: a course can vanish from Moodle after the term.

use super::api::{list_param, param, ApiError, Client};
use super::login;
use super::model::*;
use super::site::Site;
use crate::error::{AppError, AppResult};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const CONNECTION_FILE: &str = "moodle.json";
const CACHE_DIR: &str = "moodle-cache";
const FILES_DIR: &str = "moodle-files";

/// How long a started sign in can be finished.
const LOGIN_WINDOW: Duration = Duration::from_secs(15 * 60);

pub trait TokenStore: Send + Sync {
    fn get(&self) -> AppResult<Option<String>>;
    fn set(&self, token: &str) -> AppResult<()>;
    fn delete(&self) -> AppResult<()>;
}

/// One entry per app: a build installed next to the real one (its own URL scheme) keeps
/// its token apart, so disconnecting in one never signs the other out.
struct Keychain {
    account: String,
}

impl Keychain {
    fn new(scheme: &str) -> Self {
        let account = if scheme == login::DEFAULT_SCHEME {
            "token".to_string()
        } else {
            format!("token-{scheme}")
        };
        Self { account }
    }

    fn entry(&self) -> AppResult<keyring::Entry> {
        keyring::Entry::new("nookly-moodle", &self.account).map_err(keychain_error)
    }
}

impl TokenStore for Keychain {
    fn get(&self) -> AppResult<Option<String>> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(keychain_error(e)),
        }
    }
    fn set(&self, token: &str) -> AppResult<()> {
        self.entry()?.set_password(token).map_err(keychain_error)
    }
    fn delete(&self) -> AppResult<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(keychain_error(e)),
        }
    }
}

fn keychain_error(e: keyring::Error) -> AppError {
    AppError::Remote(format!("Couldn't access the system keychain: {e}"))
}

#[derive(Clone)]
struct Connection {
    site: Site,
    site_name: String,
    full_name: String,
    user_id: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConnection {
    site: String,
    site_name: String,
    full_name: String,
    user_id: i64,
}

struct Pending {
    site: Site,
    passport: String,
    started: Instant,
}

#[derive(Default)]
struct Inner {
    connection: Option<Connection>,
    pending: Option<Pending>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodleStatus {
    pub connected: bool,
    /// Connected, but the token is gone (a restored backup, a cleared keychain).
    pub needs_reconnect: bool,
    pub site_url: Option<String>,
    pub site_name: Option<String>,
    pub full_name: Option<String>,
}

/// An answer with when it was fetched. `offline` means Moodle could not be
/// reached and this is the last answer it gave.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fetched<T> {
    pub data: T,
    pub fetched_at: String,
    pub offline: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CacheFile<T> {
    fetched_at: String,
    data: T,
}

pub struct MoodleState {
    dir: PathBuf,
    scheme: String,
    tokens: Box<dyn TokenStore>,
    inner: Mutex<Inner>,
}

fn md5_hex(text: &str) -> String {
    format!("{:x}", md5::compute(text.as_bytes()))
}

impl MoodleState {
    /// `scheme` is the URL scheme this app is registered for (`login::configured_scheme`).
    pub fn load(dir: &Path, scheme: &str) -> Self {
        let mut state = Self::with_tokens(dir, Box::new(Keychain::new(scheme)));
        state.scheme = scheme.to_string();
        state
    }

    fn with_tokens(dir: &Path, tokens: Box<dyn TokenStore>) -> Self {
        // A missing or unreadable file just means "not connected"; the person
        // signs in again.
        let connection = std::fs::read_to_string(dir.join(CONNECTION_FILE))
            .ok()
            .and_then(|raw| serde_json::from_str::<StoredConnection>(&raw).ok())
            .and_then(|stored| {
                Some(Connection {
                    site: Site::parse(&stored.site).ok()?,
                    site_name: stored.site_name,
                    full_name: stored.full_name,
                    user_id: stored.user_id,
                })
            });
        Self {
            dir: dir.to_path_buf(),
            scheme: login::DEFAULT_SCHEME.to_string(),
            tokens,
            inner: Mutex::new(Inner {
                connection,
                pending: None,
            }),
        }
    }

    fn save_connection(&self, connection: &Connection) -> AppResult<()> {
        let json = serde_json::to_string(&StoredConnection {
            site: connection.site.root(),
            site_name: connection.site_name.clone(),
            full_name: connection.full_name.clone(),
            user_id: connection.user_id,
        })
        .map_err(|e| AppError::Io(e.to_string()))?;
        let path = self.dir.join(CONNECTION_FILE);
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(|e| AppError::Io(e.to_string()))?;
        std::fs::rename(&tmp, &path).map_err(|e| AppError::Io(e.to_string()))
    }

    pub async fn status(&self) -> MoodleStatus {
        let inner = self.inner.lock().await;
        match &inner.connection {
            Some(c) => {
                let has_token = matches!(self.tokens.get(), Ok(Some(_)));
                MoodleStatus {
                    connected: has_token,
                    needs_reconnect: !has_token,
                    site_url: Some(c.site.root()),
                    site_name: Some(c.site_name.clone()),
                    full_name: Some(c.full_name.clone()),
                }
            }
            None => MoodleStatus {
                connected: false,
                needs_reconnect: false,
                site_url: None,
                site_name: None,
                full_name: None,
            },
        }
    }

    /// Starts a sign in and returns the address to open in the browser.
    pub async fn begin_login(&self, input: &str) -> AppResult<String> {
        let site = Site::parse(input).map_err(AppError::Remote)?;
        let passport = crate::db::new_id();
        let url = login::launch_url(&site, &passport, &self.scheme);
        self.inner.lock().await.pending = Some(Pending {
            site,
            passport,
            started: Instant::now(),
        });
        Ok(url.to_string())
    }

    /// Finishes the sign in with what Moodle sent back to `nookly://`.
    pub async fn finish_login(&self, callback: &str) -> AppResult<MoodleStatus> {
        let mut inner = self.inner.lock().await;
        let pending = inner
            .pending
            .take()
            .filter(|p| p.started.elapsed() < LOGIN_WINDOW)
            .ok_or_else(|| {
                AppError::Remote("No Moodle sign in is waiting. Start it again from Nookly.".into())
            })?;
        let callback = login::parse_callback(callback).map_err(AppError::Remote)?;
        let client = Client::new(pending.site.clone(), callback.token.clone());
        let info: SiteInfo = client
            .call("core_webservice_get_site_info", vec![])
            .await
            .map_err(AppError::from)?;
        let typed = pending.site.root();
        if !login::signature_matches(
            &callback.signature,
            &[&typed, &info.site_url],
            &pending.passport,
        ) {
            return Err(AppError::Remote(
                "That sign in did not start from Nookly, so it was ignored.".into(),
            ));
        }
        self.tokens.set(&callback.token)?;
        let connection = Connection {
            site: pending.site,
            site_name: if info.site_name.is_empty() {
                client.site().host().to_string()
            } else {
                info.site_name
            },
            full_name: info.full_name,
            user_id: info.user_id,
        };
        self.save_connection(&connection)?;
        // Another account's answers must never show under this one.
        let _ = std::fs::remove_dir_all(self.dir.join(CACHE_DIR));
        inner.connection = Some(connection);
        drop(inner);
        Ok(self.status().await)
    }

    /// Forgets the site, the token and the cached answers. Downloaded files stay.
    pub async fn disconnect(&self) -> AppResult<()> {
        let mut inner = self.inner.lock().await;
        inner.connection = None;
        inner.pending = None;
        self.tokens.delete()?;
        let _ = std::fs::remove_file(self.dir.join(CONNECTION_FILE));
        let _ = std::fs::remove_dir_all(self.dir.join(CACHE_DIR));
        Ok(())
    }

    async fn connection(&self) -> AppResult<(Client, Connection)> {
        let connection = self
            .inner
            .lock()
            .await
            .connection
            .clone()
            .ok_or_else(|| AppError::Remote("Moodle isn't connected.".into()))?;
        let token = self.tokens.get()?.ok_or_else(|| {
            AppError::Remote("Your Moodle sign in is gone. Connect again.".into())
        })?;
        Ok((Client::new(connection.site.clone(), token), connection))
    }

    fn cache_path(&self, connection: &Connection, key: &str) -> PathBuf {
        self.dir.join(CACHE_DIR).join(format!(
            "{}.json",
            md5_hex(&format!("{}|{key}", connection.site.root()))
        ))
    }

    /// Asks Moodle; when it can't be reached, answers from the last time it did.
    async fn cached<T, Fut>(
        &self,
        key: &str,
        fetch: impl FnOnce(Client, Connection) -> Fut,
    ) -> AppResult<Fetched<T>>
    where
        T: Serialize + DeserializeOwned,
        Fut: std::future::Future<Output = Result<T, ApiError>>,
    {
        let (client, connection) = self.connection().await?;
        let path = self.cache_path(&connection, key);
        match fetch(client, connection).await {
            Ok(data) => {
                let fetched_at = crate::db::now();
                let file = CacheFile {
                    fetched_at: fetched_at.clone(),
                    data,
                };
                if let Ok(json) = serde_json::to_string(&file) {
                    let _ = std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")));
                    let _ = std::fs::write(&path, json);
                }
                Ok(Fetched {
                    data: file.data,
                    fetched_at,
                    offline: false,
                })
            }
            Err(ApiError::Offline(message)) => {
                let cached = std::fs::read_to_string(&path)
                    .ok()
                    .and_then(|raw| serde_json::from_str::<CacheFile<T>>(&raw).ok());
                match cached {
                    Some(file) => Ok(Fetched {
                        data: file.data,
                        fetched_at: file.fetched_at,
                        offline: true,
                    }),
                    None => Err(AppError::Remote(message)),
                }
            }
            Err(other) => Err(other.into()),
        }
    }

    pub async fn courses(&self) -> AppResult<Fetched<Vec<Course>>> {
        self.cached("courses", |client, c| async move {
            client
                .call(
                    "core_enrol_get_users_courses",
                    vec![param("userid", c.user_id)],
                )
                .await
        })
        .await
    }

    pub async fn contents(&self, course_id: i64) -> AppResult<Fetched<Vec<Section>>> {
        self.cached(&format!("contents/{course_id}"), |client, _| async move {
            let mut sections: Vec<Section> = client
                .call(
                    "core_course_get_contents",
                    vec![param("courseid", course_id)],
                )
                .await?;
            sections.retain(|s| s.user_visible != Some(false));
            for section in &mut sections {
                section.modules.retain(|m| m.user_visible != Some(false));
            }
            Ok(sections)
        })
        .await
    }

    pub async fn assignments(&self, course_id: i64) -> AppResult<Fetched<Vec<Assignment>>> {
        #[derive(Deserialize, Default)]
        #[serde(default)]
        struct CourseAssignments {
            assignments: Vec<Assignment>,
        }
        #[derive(Deserialize, Default)]
        #[serde(default)]
        struct Answer {
            courses: Vec<CourseAssignments>,
        }
        self.cached(
            &format!("assignments/{course_id}"),
            |client, _| async move {
                let answer: Answer = client
                    .call(
                        "mod_assign_get_assignments",
                        list_param("courseids", &[course_id]),
                    )
                    .await?;
                Ok(answer
                    .courses
                    .into_iter()
                    .flat_map(|c| c.assignments)
                    .collect())
            },
        )
        .await
    }

    pub async fn assignment_status(
        &self,
        assignment_id: i64,
    ) -> AppResult<Fetched<AssignmentStatus>> {
        self.cached(
            &format!("assignment-status/{assignment_id}"),
            |client, c| async move {
                let answer: Value = client
                    .call(
                        "mod_assign_get_submission_status",
                        vec![param("assignid", assignment_id), param("userid", c.user_id)],
                    )
                    .await?;
                Ok(read_assignment_status(&answer))
            },
        )
        .await
    }

    pub async fn grades(&self, course_id: i64) -> AppResult<Fetched<Vec<GradeItem>>> {
        #[derive(Deserialize, Default)]
        #[serde(default)]
        struct UserGrades {
            gradeitems: Vec<GradeItem>,
        }
        #[derive(Deserialize, Default)]
        #[serde(default)]
        struct Answer {
            usergrades: Vec<UserGrades>,
        }
        self.cached(&format!("grades/{course_id}"), |client, c| async move {
            let answer: Answer = client
                .call(
                    "gradereport_user_get_grade_items",
                    vec![param("courseid", course_id), param("userid", c.user_id)],
                )
                .await?;
            Ok(answer
                .usergrades
                .into_iter()
                .flat_map(|u| u.gradeitems)
                .collect())
        })
        .await
    }

    pub async fn forums(&self, course_id: i64) -> AppResult<Fetched<Vec<Forum>>> {
        self.cached(&format!("forums/{course_id}"), |client, _| async move {
            client
                .call(
                    "mod_forum_get_forums_by_courses",
                    list_param("courseids", &[course_id]),
                )
                .await
        })
        .await
    }

    pub async fn discussions(&self, forum_id: i64) -> AppResult<Fetched<Vec<Discussion>>> {
        #[derive(Deserialize, Default)]
        #[serde(default)]
        struct Answer {
            discussions: Vec<Discussion>,
        }
        self.cached(&format!("discussions/{forum_id}"), |client, _| async move {
            let answer: Answer = client
                .call(
                    "mod_forum_get_forum_discussions",
                    vec![
                        param("forumid", forum_id),
                        param("page", 0),
                        param("perpage", 100),
                    ],
                )
                .await?;
            Ok(answer.discussions)
        })
        .await
    }

    pub async fn posts(&self, discussion_id: i64) -> AppResult<Fetched<Vec<Post>>> {
        #[derive(Deserialize, Default)]
        #[serde(default)]
        struct Answer {
            posts: Vec<Post>,
        }
        self.cached(&format!("posts/{discussion_id}"), |client, _| async move {
            let answer: Answer = client
                .call(
                    "mod_forum_get_discussion_posts",
                    vec![
                        param("discussionid", discussion_id),
                        param("sortby", "created"),
                        param("sortdirection", "ASC"),
                    ],
                )
                .await?;
            Ok(answer.posts)
        })
        .await
    }

    /// The text of a small file on the site, for a Moodle page's body.
    pub async fn file_text(&self, url: &str) -> AppResult<String> {
        let (client, _) = self.connection().await?;
        Ok(client.text(url).await?)
    }

    /// Downloads a file into `moodle-files/` (once; a newer version of the same
    /// file is fetched again) and returns where it is.
    pub async fn download(
        &self,
        url: &str,
        file_name: &str,
        time_modified: i64,
    ) -> AppResult<PathBuf> {
        let (client, _) = self.connection().await?;
        let dest = self
            .dir
            .join(FILES_DIR)
            .join(&md5_hex(&format!("{url}|{time_modified}"))[..12])
            .join(safe_file_name(file_name));
        if !dest.exists() {
            client.download(url, &dest).await?;
        }
        Ok(dest)
    }
}

/// A name that stays inside its folder, whatever Moodle calls the file.
fn safe_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':' | '\0') || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').to_string();
    if cleaned.is_empty() {
        "file".into()
    } else {
        cleaned
    }
}

fn read_assignment_status(answer: &Value) -> AssignmentStatus {
    let text = |value: Option<&Value>| value.and_then(Value::as_str).map(str::to_string);
    let last = &answer["lastattempt"];
    let feedback = &answer["feedback"];
    let comments = feedback["plugins"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|plugin| plugin["editorfields"].as_array().into_iter().flatten())
        .filter_map(|field| field["text"].as_str())
        .filter(|t| !t.trim().is_empty())
        .map(str::to_string)
        .collect();
    AssignmentStatus {
        submission_status: text(last["submission"].get("status")),
        grading_status: text(last.get("gradingstatus")),
        grade: text(feedback.get("gradefordisplay")),
        feedback: comments,
    }
}

#[cfg(test)]
impl MoodleState {
    /// A state already signed in to `site`, for tests that talk to a local server.
    fn signed_in(dir: &Path, tokens: Box<dyn TokenStore>, site: Site) -> Self {
        let state = Self::with_tokens(dir, tokens);
        state.inner.try_lock().unwrap().connection = Some(Connection {
            site,
            site_name: "Uni".into(),
            full_name: "Ada Lovelace".into(),
            user_id: 7,
        });
        state
    }

    fn expect_login(&self, site: Site, passport: &str) {
        self.inner.try_lock().unwrap().pending = Some(Pending {
            site,
            passport: passport.into(),
            started: Instant::now(),
        });
    }
}

#[cfg(test)]
#[path = "service_tests.rs"]
mod tests;
