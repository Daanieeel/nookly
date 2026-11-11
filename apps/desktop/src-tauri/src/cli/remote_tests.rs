use super::*;
use crate::moodle::service::TokenStore;
use crate::moodle::test_server::{start, FakeMoodle, Request, Response};
use std::path::Path;

struct Token(Option<String>);

impl TokenStore for Token {
    fn get(&self) -> AppResult<Option<String>> {
        Ok(self.0.clone())
    }
    fn set(&self, _: &str) -> AppResult<()> {
        Ok(())
    }
    fn delete(&self) -> AppResult<()> {
        Ok(())
    }
}

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-cli-moodle-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn site() -> FakeMoodle {
    let base = std::sync::Arc::new(std::sync::Mutex::new(String::new()));
    let seen = base.clone();
    let moodle = start(move |r: &Request| {
        if r.path.contains("/webservice/pluginfile.php/") {
            return Response::bytes(200, b"slide data");
        }
        let answer = match r.form.get("wsfunction").map(String::as_str) {
            Some("core_enrol_get_users_courses") => json!([
                { "id": 4, "fullname": "Algorithms", "shortname": "ALG" },
                { "id": 9, "fullname": "Databases", "shortname": "DB" },
            ]),
            Some("mod_assign_get_assignments") => json!({ "courses": [{ "assignments": [
                { "id": 31, "cmid": 7, "name": "Sheet 1", "duedate": 1_800_000_000 },
                { "id": 32, "cmid": 8, "name": "Sheet 2", "duedate": 1_800_500_000 },
            ] }] }),
            Some("mod_assign_get_submission_status") => json!({
                "lastattempt": { "submission": { "status": "submitted" }, "gradingstatus": "notgraded" },
            }),
            Some("core_course_get_contents") => json!([{ "id": 1, "name": "Week 1", "modules": [
                { "id": 5, "name": "Slides", "modname": "resource", "contents": [
                    { "type": "file", "filename": "slides.pdf", "filesize": 10,
                      "fileurl": format!("{}/pluginfile.php/1/slides.pdf", seen.lock().unwrap()),
                      "timemodified": 5 },
                ] },
            ] }]),
            _ => json!({ "exception": "x", "errorcode": "accessexception", "message": "no" }),
        };
        Response::json(answer)
    });
    *base.lock().unwrap() = moodle.site.root();
    moodle
}

fn state(moodle: &FakeMoodle, dir: &Path) -> MoodleState {
    MoodleState::signed_in(
        dir,
        Box::new(Token(Some("tok".into()))),
        moodle.site.clone(),
    )
}

fn args(line: &str) -> Args {
    parse_args(
        &line
            .split_whitespace()
            .map(str::to_string)
            .collect::<Vec<_>>(),
    )
    .unwrap()
}

fn read(state: &MoodleState, type_name: &str, verb: &str, line: &str) -> AppResult<Value> {
    let def = remote::lookup(type_name).unwrap();
    run_verb(state, def, verb, &args(line), false)
}

#[test]
fn courses_list_live_with_when_they_were_fetched() {
    let moodle = site();
    let dir = temp_dir();
    let listed = read(&state(&moodle, &dir), "moodle_course", "list", "").unwrap();
    assert_eq!(listed["remote"], true);
    assert_eq!(listed["count"], 2);
    assert_eq!(listed["items"][0]["fullName"], "Algorithms");
    assert_eq!(listed["offline"], false);
    assert!(listed["fetchedAt"].is_string());
}

#[test]
fn a_type_read_under_a_course_needs_one() {
    let moodle = site();
    let dir = temp_dir();
    let state = state(&moodle, &dir);
    let err = read(&state, "moodle_assignment", "list", "").unwrap_err();
    assert!(
        err.to_string().contains("missing required flag: --course"),
        "{err}"
    );
    let err = read(&state, "moodle_assignment", "list", "--course four").unwrap_err();
    assert!(err.to_string().contains("--course expects"), "{err}");
    let listed = read(&state, "moodle_assignment", "list", "--course 4").unwrap();
    assert_eq!(listed["count"], 2);
    assert_eq!(listed["items"][1]["name"], "Sheet 2");
}

#[test]
fn list_trims_with_fields_and_limit_and_keeps_the_id() {
    let moodle = site();
    let dir = temp_dir();
    let state = state(&moodle, &dir);
    let listed = read(
        &state,
        "moodle_assignment",
        "list",
        "--course 4 --fields name,dueDate --limit 1",
    )
    .unwrap();
    assert_eq!(listed["count"], 2);
    assert_eq!(listed["returned"], 1);
    let row = listed["items"][0].as_object().unwrap();
    assert_eq!(row.len(), 3, "{row:?}");
    assert_eq!(row["id"], 31);
    assert_eq!(row["dueDate"], 1_800_000_000);
    let err = read(
        &state,
        "moodle_assignment",
        "list",
        "--course 4 --fields nope",
    )
    .unwrap_err();
    assert!(err.to_string().contains("Known fields"), "{err}");
}

#[test]
fn get_finds_a_row_and_adds_the_assignment_status() {
    let moodle = site();
    let dir = temp_dir();
    let state = state(&moodle, &dir);
    let got = read(&state, "moodle_assignment", "get", "32 --course 4").unwrap();
    assert_eq!(got["data"]["name"], "Sheet 2");
    assert_eq!(got["data"]["status"]["submissionStatus"], "submitted");
    let course = read(&state, "moodle_course", "get", "9").unwrap();
    assert_eq!(course["data"]["shortName"], "DB");
    assert!(course["data"].get("status").is_none());
    let err = read(&state, "moodle_course", "get", "77").unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)), "{err}");
}

#[test]
fn files_are_flattened_and_their_address_downloads() {
    let moodle = site();
    let dir = temp_dir();
    let state = state(&moodle, &dir);
    let files = read(&state, "moodle_file", "list", "--course 4").unwrap();
    assert_eq!(files["count"], 1);
    assert_eq!(files["items"][0]["sectionName"], "Week 1");
    assert_eq!(files["items"][0]["moduleName"], "Slides");
    let url = files["items"][0]["fileUrl"].as_str().unwrap();
    let out = dir.join("from-list.pdf");
    read(
        &state,
        "moodle_file",
        "download",
        &format!("--url {url} --out {}", out.display()),
    )
    .unwrap();
    assert_eq!(std::fs::read(&out).unwrap(), b"slide data");
    let again = read(&state, "moodle_file", "get", &format!("{url} --course 4")).unwrap();
    assert_eq!(again["data"]["fileName"], "slides.pdf");
}

#[test]
fn download_writes_a_new_file_and_never_overwrites() {
    let moodle = site();
    let dir = temp_dir();
    let state = state(&moodle, &dir);
    let url = moodle.site.page("pluginfile.php/1/slides.pdf").to_string();
    let out = dir.join("slides.pdf");
    let line = format!("--url {url} --out {}", out.display());

    let dry = run_verb(
        &state,
        remote::lookup("moodle_file").unwrap(),
        "download",
        &args(&line),
        true,
    )
    .unwrap();
    assert!(dry["wouldSaveTo"].is_string());
    assert!(!out.exists(), "a dry run downloads nothing");

    let saved = read(&state, "moodle_file", "download", &line).unwrap();
    assert_eq!(saved["bytes"], 10);
    assert_eq!(std::fs::read(&out).unwrap(), b"slide data");

    std::fs::write(&out, b"mine").unwrap();
    let err = read(&state, "moodle_file", "download", &line).unwrap_err();
    assert!(err.to_string().contains("already exists"), "{err}");
    assert_eq!(std::fs::read(&out).unwrap(), b"mine");
}

#[test]
fn download_into_a_folder_needs_a_file_name() {
    let moodle = site();
    let dir = temp_dir();
    let state = state(&moodle, &dir);
    let url = moodle.site.page("pluginfile.php/1/slides.pdf").to_string();
    let err = read(
        &state,
        "moodle_file",
        "download",
        &format!("--url {url} --out {}", dir.display()),
    )
    .unwrap_err();
    assert!(err.to_string().contains("--file-name"), "{err}");
    read(
        &state,
        "moodle_file",
        "download",
        &format!("--url {url} --out {} --file-name ../a.pdf", dir.display()),
    )
    .unwrap();
    assert_eq!(std::fs::read(dir.join("_a.pdf")).unwrap(), b"slide data");
}

#[test]
fn only_files_download_and_nothing_writes() {
    let moodle = site();
    let dir = temp_dir();
    let state = state(&moodle, &dir);
    for (type_name, verb) in [
        ("moodle_course", "download"),
        ("moodle_course", "create"),
        ("moodle_assignment", "delete"),
        ("moodle_file", "update"),
    ] {
        let err = read(&state, type_name, verb, "").unwrap_err();
        assert!(
            err.to_string().contains("read only"),
            "{type_name} {verb}: {err}"
        );
    }
}

#[test]
fn not_signed_in_tells_the_agent_to_ask_the_user() {
    let dir = temp_dir();
    let state = MoodleState::load(&dir, "nookly-cli-test");
    let err = read(&state, "moodle_course", "list", "").unwrap_err();
    assert!(matches!(err, AppError::Remote(_)), "{err}");
    let message = err.to_string();
    assert!(message.contains("not signed in to Moodle"), "{message}");
    assert!(message.contains("ask the user"), "{message}");
}

#[test]
fn a_token_that_is_gone_says_the_same() {
    let moodle = site();
    let dir = temp_dir();
    let state = MoodleState::signed_in(&dir, Box::new(Token(None)), moodle.site.clone());
    let message = read(&state, "moodle_course", "list", "")
        .unwrap_err()
        .to_string();
    assert!(message.contains("sign in is gone"), "{message}");
    assert!(message.contains("ask the user"), "{message}");
}

#[test]
fn the_schema_and_describe_list_moodle_as_remote_and_read_only() {
    let conn = crate::db::test_conn();
    let schema = dispatch(&conn, vec!["schema".into()]).unwrap();
    let remote_types = schema["remoteTypes"].as_array().unwrap();
    assert_eq!(remote_types.len(), remote::all().len());
    assert!(remote_types
        .iter()
        .all(|t| t["remote"] == true && t["readOnly"] == true));
    let described = dispatch(&conn, vec!["describe".into(), "moodle_forum".into()]).unwrap();
    assert_eq!(described["parent"]["flag"], "course");
    let bare = dispatch(&conn, vec!["moodle_forum".into()]).unwrap();
    assert_eq!(bare, described);
}

#[test]
fn remote_types_are_not_entities() {
    let conn = crate::db::test_conn();
    let err = dispatch(&conn, vec!["moodle_course".into(), "frobnicate".into()]);
    // Never reaches the keychain for a verb that does not exist.
    assert!(err.unwrap_err().to_string().contains("read only"));
    let hits = dispatch(&conn, vec!["search".into(), "moodle".into()]).unwrap();
    assert_eq!(hits["count"], 0);
}
