use super::super::test_server::{start, FakeMoodle, Request, Response};
use super::*;
use base64::Engine;
use serde_json::json;
use std::sync::Mutex as StdMutex;

struct Memory(StdMutex<Option<String>>);

impl Memory {
    fn with(token: Option<&str>) -> Box<dyn TokenStore> {
        Box::new(Memory(StdMutex::new(token.map(str::to_string))))
    }
}

impl TokenStore for Memory {
    fn get(&self) -> AppResult<Option<String>> {
        Ok(self.0.lock().unwrap().clone())
    }
    fn set(&self, token: &str) -> AppResult<()> {
        *self.0.lock().unwrap() = Some(token.into());
        Ok(())
    }
    fn delete(&self) -> AppResult<()> {
        *self.0.lock().unwrap() = None;
        Ok(())
    }
}

fn run<F: std::future::Future>(f: F) -> F::Output {
    tauri::async_runtime::block_on(f)
}

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-moodle-svc-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// A fake site answering each web service function with `answers[function]`.
fn site_answering(answers: Vec<(&'static str, Value)>) -> FakeMoodle {
    start(move |r: &Request| {
        let function = r.form.get("wsfunction").cloned().unwrap_or_default();
        match answers.iter().find(|(name, _)| *name == function) {
            Some((_, value)) => Response::json(value.clone()),
            None => Response::json(
                json!({ "exception": "x", "errorcode": "accessexception", "message": "no" }),
            ),
        }
    })
}

fn state_for(moodle: &FakeMoodle, dir: &Path) -> MoodleState {
    MoodleState::signed_in(dir, Memory::with(Some("tok")), moodle.site.clone())
}

fn callback(signature: &str, token: &str) -> String {
    format!(
        "nookly://token={}",
        base64::engine::general_purpose::STANDARD.encode(format!("{signature}:::{token}"))
    )
}

#[test]
fn signing_in_checks_the_site_and_the_passport() {
    let moodle = site_answering(vec![(
        "core_webservice_get_site_info",
        json!({ "sitename": "Uni Moodle", "fullname": "Ada Lovelace", "userid": 7, "siteurl": moodle_url_placeholder() }),
    )]);
    let dir = temp_dir();
    let state = MoodleState::with_tokens(&dir, Memory::with(None));
    state.expect_login(moodle.site.clone(), "PASS");
    let signature = md5_hex(&format!("{}PASS", moodle.site.root()));
    let status = run(state.finish_login(&callback(&signature, "tok"))).unwrap();
    assert!(status.connected && !status.needs_reconnect);
    assert_eq!(status.site_name.as_deref(), Some("Uni Moodle"));
    assert_eq!(status.full_name.as_deref(), Some("Ada Lovelace"));
    assert_eq!(state.tokens.get().unwrap().as_deref(), Some("tok"));
    assert!(dir.join("moodle.json").exists());
    let _ = std::fs::remove_dir_all(dir);
}

fn moodle_url_placeholder() -> &'static str {
    "https://not-the-typed-address.example"
}

#[test]
fn a_login_nookly_did_not_start_is_ignored() {
    let moodle = site_answering(vec![(
        "core_webservice_get_site_info",
        json!({ "sitename": "Uni", "fullname": "A", "userid": 7, "siteurl": "x" }),
    )]);
    let dir = temp_dir();
    let state = MoodleState::with_tokens(&dir, Memory::with(None));
    // No sign in was started: a link from a web page does nothing.
    let err = run(state.finish_login(&callback("abc", "tok"))).unwrap_err();
    assert!(err.to_string().contains("No Moodle sign in"), "{err}");
    // One was started, but the link carries somebody else's signature.
    state.expect_login(moodle.site.clone(), "PASS");
    let err = run(state.finish_login(&callback(&md5_hex("attackerPASS"), "tok"))).unwrap_err();
    assert!(
        err.to_string().contains("did not start from Nookly"),
        "{err}"
    );
    assert!(state.tokens.get().unwrap().is_none());
    assert!(!dir.join("moodle.json").exists());
    assert!(!run(state.status()).connected);
    // The attempt is spent either way.
    let err = run(state.finish_login(&callback(
        &md5_hex(&format!("{}PASS", moodle.site.root())),
        "tok",
    )))
    .unwrap_err();
    assert!(err.to_string().contains("No Moodle sign in"), "{err}");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn begin_login_refuses_plain_http_and_returns_the_launch_page() {
    let dir = temp_dir();
    let state = MoodleState::with_tokens(&dir, Memory::with(None));
    assert!(run(state.begin_login("http://uni.edu")).is_err());
    let url = run(state.begin_login("uni.edu/my/")).unwrap();
    assert!(
        url.starts_with("https://uni.edu/admin/tool/mobile/launch.php?"),
        "{url}"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn begin_login_asks_moodle_to_return_to_this_apps_scheme() {
    let dir = temp_dir();
    let state = MoodleState::load(&dir, "nookly-dev");
    let url = run(state.begin_login("uni.edu")).unwrap();
    assert!(url.contains("urlscheme=nookly-dev"), "{url}");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_missing_token_asks_to_reconnect_and_a_restart_remembers_the_site() {
    let dir = temp_dir();
    std::fs::write(
        dir.join("moodle.json"),
        json!({ "site": "https://uni.edu", "siteName": "Uni", "fullName": "Ada", "userId": 7 })
            .to_string(),
    )
    .unwrap();
    let state = MoodleState::with_tokens(&dir, Memory::with(None));
    let status = run(state.status());
    assert!(!status.connected && status.needs_reconnect);
    assert_eq!(status.site_url.as_deref(), Some("https://uni.edu"));
    assert!(run(state.courses()).is_err());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_damaged_connection_file_means_not_connected() {
    let dir = temp_dir();
    std::fs::write(dir.join("moodle.json"), "{ nope").unwrap();
    let state = MoodleState::with_tokens(&dir, Memory::with(Some("tok")));
    let status = run(state.status());
    assert!(!status.connected && !status.needs_reconnect && status.site_url.is_none());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn lists_courses() {
    let moodle = site_answering(vec![(
        "core_enrol_get_users_courses",
        json!([{ "id": 4, "shortname": "MA1", "fullname": "Maths 1", "summary": "<p>Hi</p>", "startdate": 100, "enddate": 200, "progress": 40.5, "hidden": false, "extra": 1 }]),
    )]);
    let dir = temp_dir();
    let courses = run(state_for(&moodle, &dir).courses()).unwrap();
    assert!(!courses.offline);
    assert_eq!(courses.data.len(), 1);
    let course = &courses.data[0];
    assert_eq!(
        (
            course.id,
            course.short_name.as_str(),
            course.full_name.as_str()
        ),
        (4, "MA1", "Maths 1")
    );
    assert_eq!(course.progress, Some(40.5));
    let sent = moodle.requests.lock().unwrap()[0].clone();
    assert_eq!(sent.form["userid"], "7");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn serves_the_last_answer_when_moodle_is_out_of_reach() {
    let down = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = down.clone();
    let moodle = start(move |_| {
        if flag.load(std::sync::atomic::Ordering::SeqCst) {
            Response::hang_up()
        } else {
            Response::json(json!([{ "id": 4, "fullname": "Maths 1" }]))
        }
    });
    let dir = temp_dir();
    let state = state_for(&moodle, &dir);
    let live = run(state.courses()).unwrap();
    assert!(!live.offline);

    down.store(true, std::sync::atomic::Ordering::SeqCst);
    let offline = run(state.courses()).unwrap();
    assert!(offline.offline);
    assert_eq!(offline.data, live.data);
    assert_eq!(offline.fetched_at, live.fetched_at);

    // Never seen before: nothing to show, so it says why.
    let err = run(state.grades(99)).unwrap_err();
    assert!(err.to_string().contains("Couldn't reach Moodle"), "{err}");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn a_rejected_token_is_an_error_not_a_cached_answer() {
    let moodle = start(|_| {
        Response::json(
            json!({ "exception": "x", "errorcode": "invalidtoken", "message": "Invalid token" }),
        )
    });
    let dir = temp_dir();
    let state = state_for(&moodle, &dir);
    let err = run(state.courses()).unwrap_err();
    assert!(err.to_string().contains("Connect again"), "{err}");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn course_contents_hide_what_the_student_cannot_see() {
    let moodle = site_answering(vec![(
        "core_course_get_contents",
        json!([
            { "id": 1, "name": "Week 1", "summary": "", "modules": [
                { "id": 10, "name": "Slides", "modname": "resource", "url": "https://x/mod/resource/view.php?id=10",
                  "contents": [{ "type": "file", "filename": "slides.pdf", "filesize": 12, "fileurl": "https://x/pluginfile.php/1/slides.pdf", "timemodified": 5, "mimetype": "application/pdf" }] },
                { "id": 11, "name": "Draft", "modname": "page", "uservisible": false }
            ]},
            { "id": 2, "name": "Hidden week", "uservisible": false, "modules": [] }
        ]),
    )]);
    let dir = temp_dir();
    let contents = run(state_for(&moodle, &dir).contents(4)).unwrap().data;
    assert_eq!(contents.len(), 1);
    assert_eq!(contents[0].modules.len(), 1);
    let file = &contents[0].modules[0].contents[0];
    assert_eq!(
        (file.kind.as_str(), file.file_name.as_str(), file.file_size),
        ("file", "slides.pdf", 12)
    );
    assert_eq!(file.mime_type, "application/pdf");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn lists_assignments_and_their_status() {
    let moodle = site_answering(vec![
        (
            "mod_assign_get_assignments",
            json!({ "courses": [{ "id": 4, "assignments": [
                { "id": 3, "cmid": 30, "name": "Essay", "duedate": 999, "intro": "<p>Write</p>",
                  "introattachments": [{ "filename": "brief.pdf", "fileurl": "https://x/f", "filesize": 1 }] }
            ]}], "warnings": [] }),
        ),
        (
            "mod_assign_get_submission_status",
            json!({
                "lastattempt": { "submission": { "status": "submitted" }, "gradingstatus": "graded" },
                "feedback": { "gradefordisplay": "8.50 / 10.00", "plugins": [
                    { "type": "comments", "editorfields": [{ "text": "<p>Well done</p>" }, { "text": "  " }] },
                    { "type": "file", "fileareas": [] }
                ]},
            }),
        ),
    ]);
    let dir = temp_dir();
    let state = state_for(&moodle, &dir);
    let assignments = run(state.assignments(4)).unwrap().data;
    assert_eq!(assignments.len(), 1);
    assert_eq!(
        (
            assignments[0].id,
            assignments[0].cmid,
            assignments[0].due_date
        ),
        (3, 30, 999)
    );
    assert_eq!(assignments[0].attachments[0].file_name, "brief.pdf");
    let status = run(state.assignment_status(3)).unwrap().data;
    assert_eq!(status.submission_status.as_deref(), Some("submitted"));
    assert_eq!(status.grading_status.as_deref(), Some("graded"));
    assert_eq!(status.grade.as_deref(), Some("8.50 / 10.00"));
    assert_eq!(status.feedback, vec!["<p>Well done</p>".to_string()]);
    let sent: Vec<_> = moodle.requests.lock().unwrap().clone();
    assert_eq!(sent[0].form["courseids[0]"], "4");
    assert_eq!(
        (
            sent[1].form["assignid"].as_str(),
            sent[1].form["userid"].as_str()
        ),
        ("3", "7")
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn an_assignment_nobody_touched_has_an_empty_status() {
    let moodle = site_answering(vec![("mod_assign_get_submission_status", json!({}))]);
    let dir = temp_dir();
    let status = run(state_for(&moodle, &dir).assignment_status(3))
        .unwrap()
        .data;
    assert_eq!(status, AssignmentStatus::default());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn lists_grade_items() {
    let moodle = site_answering(vec![(
        "gradereport_user_get_grade_items",
        json!({ "usergrades": [{ "courseid": 4, "gradeitems": [
            { "id": 1, "itemname": "Essay", "itemtype": "mod", "itemmodule": "assign", "cmid": 30,
              "gradeformatted": "8.50", "rangeformatted": "0-10", "percentageformatted": "85 %", "weightformatted": "50 %", "feedback": "Nice" },
            { "id": 2, "itemname": null, "itemtype": "course", "gradeformatted": "8.50" }
        ]}]}),
    )]);
    let dir = temp_dir();
    let items = run(state_for(&moodle, &dir).grades(4)).unwrap().data;
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].name.as_deref(), Some("Essay"));
    assert_eq!(items[0].percentage.as_deref(), Some("85 %"));
    assert_eq!(
        (items[1].name.clone(), items[1].item_type.as_str()),
        (None, "course")
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn reads_forums_discussions_and_posts() {
    let moodle = site_answering(vec![
        (
            "mod_forum_get_forums_by_courses",
            json!([{ "id": 1, "cmid": 50, "name": "Announcements", "type": "news", "intro": "", "numdiscussions": 2 }]),
        ),
        (
            "mod_forum_get_forum_discussions",
            json!({ "discussions": [{ "id": 900, "discussion": 12, "name": "Exam dates", "subject": "Exam dates", "message": "<p>May</p>",
                "userfullname": "Prof X", "timemodified": 77, "numreplies": 3, "pinned": true,
                "attachments": [{ "filename": "dates.pdf", "fileurl": "https://x/f" }] }] }),
        ),
        (
            "mod_forum_get_discussion_posts",
            json!({ "posts": [
                { "id": 900, "parentid": 0, "subject": "Exam dates", "message": "<p>May</p>", "author": { "fullname": "Prof X" }, "timecreated": 70, "attachments": [] },
                { "id": 901, "parentid": 900, "subject": "Re: Exam dates", "message": "<p>Thanks</p>", "author": { "fullname": "Ada" }, "timecreated": 80 }
            ]}),
        ),
    ]);
    let dir = temp_dir();
    let state = state_for(&moodle, &dir);
    let forums = run(state.forums(4)).unwrap().data;
    assert_eq!(
        (
            forums[0].kind.as_str(),
            forums[0].cmid,
            forums[0].num_discussions
        ),
        ("news", 50, 2)
    );
    let discussions = run(state.discussions(1)).unwrap().data;
    assert_eq!(
        discussions[0].discussion_id, 12,
        "the discussion id, not the first post's id"
    );
    assert_eq!(
        (
            discussions[0].author.as_str(),
            discussions[0].num_replies,
            discussions[0].pinned
        ),
        ("Prof X", 3, true)
    );
    assert_eq!(discussions[0].attachments[0].file_name, "dates.pdf");
    let posts = run(state.posts(12)).unwrap().data;
    assert_eq!(posts.len(), 2);
    assert_eq!(
        (posts[1].parent_id, posts[1].author.full_name.as_str()),
        (900, "Ada")
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn downloads_once_and_again_when_the_file_changes() {
    let moodle = start(|r| {
        if r.path.contains("/webservice/pluginfile.php/") {
            Response::bytes(200, b"data")
        } else {
            Response::bytes(404, b"")
        }
    });
    let dir = temp_dir();
    let state = state_for(&moodle, &dir);
    let url = moodle.site.page("pluginfile.php/1/slides.pdf").to_string();
    let first = run(state.download(&url, "slides.pdf", 5)).unwrap();
    assert_eq!(std::fs::read(&first).unwrap(), b"data");
    assert!(first.starts_with(dir.join("moodle-files")));
    let again = run(state.download(&url, "slides.pdf", 5)).unwrap();
    assert_eq!(again, first);
    assert_eq!(moodle.requests.lock().unwrap().len(), 1, "already on disk");
    let newer = run(state.download(&url, "slides.pdf", 6)).unwrap();
    assert_ne!(newer, first);
    assert!(first.exists(), "the old copy is never deleted");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn file_names_cannot_leave_their_folder() {
    assert_eq!(safe_file_name("../../etc/passwd"), "_.._etc_passwd");
    assert_eq!(safe_file_name("a/b\\c:d.pdf"), "a_b_c_d.pdf");
    assert_eq!(safe_file_name(".hidden"), "hidden");
    assert_eq!(safe_file_name("   "), "file");
    assert_eq!(safe_file_name(""), "file");
}

#[test]
fn disconnecting_forgets_the_site_but_keeps_downloaded_files() {
    let moodle = site_answering(vec![("core_enrol_get_users_courses", json!([{ "id": 4 }]))]);
    let dir = temp_dir();
    let state = state_for(&moodle, &dir);
    run(state.courses()).unwrap();
    state
        .save_connection(&state.inner.try_lock().unwrap().connection.clone().unwrap())
        .unwrap();
    std::fs::create_dir_all(dir.join("moodle-files/abc")).unwrap();
    std::fs::write(dir.join("moodle-files/abc/slides.pdf"), b"keep").unwrap();
    assert!(dir.join("moodle-cache").exists() && dir.join("moodle.json").exists());

    run(state.disconnect()).unwrap();

    assert!(!dir.join("moodle-cache").exists() && !dir.join("moodle.json").exists());
    assert!(state.tokens.get().unwrap().is_none());
    assert_eq!(
        std::fs::read(dir.join("moodle-files/abc/slides.pdf")).unwrap(),
        b"keep"
    );
    let status = run(state.status());
    assert!(!status.connected && status.site_url.is_none());
    let _ = std::fs::remove_dir_all(dir);
}
