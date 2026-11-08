use super::*;
use crate::db::device::TEST_DEVICE;
use crate::db::files::reference_file;
use crate::db::spaces::create_space;

fn setup() -> (Connection, String) {
    let conn = crate::db::test_conn();
    let space = create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
    (conn, space.id)
}

fn scratch(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("nookly-ref-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(name);
    std::fs::write(&path, b"hello").unwrap();
    path
}

#[test]
fn each_probe_means_one_state_and_offline_shows_the_last_answer() {
    let seen = Some("2026-11-01T10:00:00+00:00");
    let cases = [
        (Probe::Reached, ReferenceState::Available, None),
        (Probe::Unreachable, ReferenceState::Offline, seen),
        (Probe::Gone, ReferenceState::Missing, None),
        (Probe::SignInNeeded, ReferenceState::NeedsSignIn, None),
        (Probe::NotHere, ReferenceState::NotOnThisDevice, None),
    ];
    for (probe, state, as_of) in cases {
        let status = status_from(probe, seen);
        assert_eq!(status.state, state, "{probe:?}");
        assert_eq!(status.as_of.as_deref(), as_of, "{probe:?}");
    }
    // Offline before it ever answered has no moment to show.
    assert_eq!(status_from(Probe::Unreachable, None).as_of, None);
}

#[test]
fn state_serializes_in_camel_case_for_the_ui() {
    let json = serde_json::to_value(status_from(Probe::NotHere, None)).unwrap();
    assert_eq!(json["state"], "notOnThisDevice");
    let json = serde_json::to_value(status_from(Probe::SignInNeeded, None)).unwrap();
    assert_eq!(json["state"], "needsSignIn");
}

#[test]
fn http_answers_map_to_states() {
    assert_eq!(probe_http_status(200), Probe::Reached);
    assert_eq!(probe_http_status(302), Probe::Reached);
    assert_eq!(probe_http_status(404), Probe::Gone);
    assert_eq!(probe_http_status(410), Probe::Gone);
    assert_eq!(probe_http_status(401), Probe::SignInNeeded);
    assert_eq!(probe_http_status(403), Probe::SignInNeeded);
    assert_eq!(probe_http_status(405), Probe::Reached);
    assert_eq!(probe_http_status(503), Probe::Unreachable);
    assert_eq!(probe_http_status(429), Probe::Unreachable);
}

#[test]
fn a_link_that_is_not_a_web_address_is_gone_and_an_unreachable_one_is_offline() {
    assert_eq!(probe_link("not a url"), Probe::Gone);
    assert_eq!(probe_link("file:///etc/hosts"), Probe::Gone);
    // Nothing listens on port 1.
    assert_eq!(probe_link("http://127.0.0.1:1/x"), Probe::Unreachable);
}

#[test]
fn a_link_is_looked_at_with_a_real_request() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        for (n, stream) in listener.incoming().take(2).enumerate() {
            let mut stream = stream.unwrap();
            let mut buf = [0u8; 1024];
            let _ = stream.read(&mut buf);
            let status = if n == 0 { "200 OK" } else { "404 Not Found" };
            let _ = write!(
                stream,
                "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
        }
    });
    assert_eq!(
        probe_link(&format!("http://127.0.0.1:{port}/a")),
        Probe::Reached
    );
    assert_eq!(
        probe_link(&format!("http://127.0.0.1:{port}/b")),
        Probe::Gone
    );
}

#[test]
fn a_reference_entity_can_be_made_read_searched_and_linked() {
    let (conn, space) = setup();
    let course = crate::db::courses::create_course(&conn, space.clone(), "Physics".into()).unwrap();
    let reference = create_reference(
        &conn,
        space.clone(),
        PROVIDER_MOODLE_COURSE,
        " 42 ",
        Some("Physics 101"),
    )
    .unwrap();
    assert_eq!(reference.entity.entity_type, "reference");
    assert_eq!(reference.entity.key, "REF-1");
    assert_eq!(reference.entity.title, "Physics 101");
    assert_eq!(reference.facts.remote_id, "42");
    assert_eq!(
        reference.facts.last_known_title.as_deref(),
        Some("Physics 101")
    );
    assert_eq!(reference.facts.status, None);

    // Linkable through the one relationship system, and findable by title.
    crate::db::relationships::create_relationship(
        &conn,
        course.id.clone(),
        reference.entity.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    let hits = crate::db::search::search(&conn, "Physics 101", None).unwrap();
    assert!(hits.iter().any(|h| h.entity_id == reference.entity.id));
    assert_eq!(list_references(&conn, &space).unwrap().len(), 1);
}

#[test]
fn a_reference_with_no_title_is_named_after_its_target() {
    let (conn, space) = setup();
    let reference =
        create_reference(&conn, space, PROVIDER_LINK, "https://a.dev/x", Some("  ")).unwrap();
    assert_eq!(reference.entity.title, "https://a.dev/x");
}

#[test]
fn bad_targets_are_refused_before_anything_is_written() {
    let (conn, space) = setup();
    for (provider, remote) in [
        ("file", "/tmp/a.pdf"),
        ("nope", "x"),
        (PROVIDER_LINK, "ftp://a.dev"),
        (PROVIDER_LINK, "not a url"),
        (PROVIDER_LINK, "   "),
        (PROVIDER_MOODLE_COURSE, "abc"),
        (PROVIDER_MOODLE_ASSIGNMENT, "12"),
        (PROVIDER_MOODLE_ASSIGNMENT, "a:b"),
    ] {
        assert!(
            create_reference(&conn, space.clone(), provider, remote, None).is_err(),
            "{provider} {remote}"
        );
    }
    let entities: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM entities WHERE type = 'reference'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(entities, 0);
    assert!(create_reference(&conn, space, PROVIDER_MOODLE_ASSIGNMENT, "12:34", None).is_ok());
}

#[test]
fn pointing_a_reference_elsewhere_forgets_what_was_known() {
    let (conn, space) = setup();
    let r = create_reference(&conn, space, PROVIDER_LINK, "https://a.dev", None).unwrap();
    record_probe(&conn, &r.entity.id, Probe::Reached, Some("A site")).unwrap();
    let same = retarget(&conn, &r.entity.id, "https://a.dev").unwrap();
    assert_eq!(same.facts.last_result.as_deref(), Some("available"));
    let moved = retarget(&conn, &r.entity.id, "https://b.dev").unwrap();
    assert_eq!(moved.facts.remote_id, "https://b.dev");
    assert_eq!(moved.facts.last_seen_at, None);
    assert_eq!(moved.facts.last_result, None);
}

#[test]
fn a_probe_keeps_the_last_answer_and_only_a_reached_one_moves_last_seen() {
    let (conn, space) = setup();
    let r = create_reference(&conn, space, PROVIDER_LINK, "https://a.dev", None).unwrap();
    let id = r.entity.id;
    assert_eq!(get_reference(&conn, &id).unwrap().facts.last_result, None);

    record_probe(&conn, &id, Probe::Unreachable, None).unwrap();
    let facts = get_reference(&conn, &id).unwrap().facts;
    assert_eq!(facts.last_result.as_deref(), Some("offline"));
    assert_eq!(facts.last_seen_at, None);

    record_probe(&conn, &id, Probe::Reached, Some("Real title")).unwrap();
    let facts = get_reference(&conn, &id).unwrap().facts;
    assert_eq!(facts.last_result.as_deref(), Some("available"));
    assert_eq!(facts.last_known_title.as_deref(), Some("Real title"));
    let seen = facts.last_seen_at.clone().expect("seen");

    // Going offline later keeps when it last answered, which "Offline, as of" shows.
    record_probe(&conn, &id, Probe::Unreachable, None).unwrap();
    let facts = get_reference(&conn, &id).unwrap().facts;
    assert_eq!(facts.last_result.as_deref(), Some("offline"));
    assert_eq!(facts.last_seen_at.as_deref(), Some(seen.as_str()));
    // The entity's own title, which the user may have changed, is never touched.
    assert_eq!(
        get_reference(&conn, &id).unwrap().entity.title,
        "https://a.dev"
    );

    // What a device lacks says nothing about the target.
    record_probe(&conn, &id, Probe::NotHere, Some("ignored")).unwrap();
    assert_eq!(
        get_reference(&conn, &id)
            .unwrap()
            .facts
            .last_known_title
            .as_deref(),
        Some("Real title")
    );
}

#[test]
fn looking_again_soon_does_not_write_again() {
    let (conn, space) = setup();
    let r = create_reference(&conn, space, PROVIDER_LINK, "https://a.dev", None).unwrap();
    record_probe(&conn, &r.entity.id, Probe::Reached, None).unwrap();
    // Pretend the last look was a moment ago, with a marker only a write would remove.
    let marker = crate::db::now();
    conn.execute(
        "UPDATE entity_references SET last_seen_at = ?1 WHERE entity_id = ?2",
        params![marker, r.entity.id],
    )
    .unwrap();
    record_probe(&conn, &r.entity.id, Probe::Reached, None).unwrap();
    assert_eq!(
        get_reference(&conn, &r.entity.id)
            .unwrap()
            .facts
            .last_seen_at
            .as_deref(),
        Some(marker.as_str())
    );
    // An hour later it is written again.
    let old = (chrono::Utc::now() - chrono::Duration::hours(2)).to_rfc3339();
    conn.execute(
        "UPDATE entity_references SET last_seen_at = ?1 WHERE entity_id = ?2",
        params![old, r.entity.id],
    )
    .unwrap();
    record_probe(&conn, &r.entity.id, Probe::Reached, None).unwrap();
    assert_ne!(
        get_reference(&conn, &r.entity.id)
            .unwrap()
            .facts
            .last_seen_at
            .as_deref(),
        Some(old.as_str())
    );
}

#[test]
fn a_file_is_available_missing_or_not_on_this_device() {
    let (conn, space) = setup();
    let path = scratch("notes.pdf");
    let file = reference_file(&conn, space, &path).unwrap();
    let id = file.entity.id.clone();

    let status = |conn: &Connection, device: &str| {
        facts_for_device(conn, &id, device)
            .unwrap()
            .unwrap()
            .status
            .unwrap()
            .state
    };
    assert_eq!(status(&conn, TEST_DEVICE), ReferenceState::Available);
    // The same record, seen from a device that never had the path.
    assert_eq!(status(&conn, "phone"), ReferenceState::NotOnThisDevice);

    std::fs::remove_file(&path).unwrap();
    assert_eq!(status(&conn, TEST_DEVICE), ReferenceState::Missing);
    // The other device still has nothing here: a gone file is no news to it.
    assert_eq!(status(&conn, "phone"), ReferenceState::NotOnThisDevice);
}

#[test]
fn locating_sets_the_path_for_one_device_only() {
    let (conn, space) = setup();
    let original = scratch("a.pdf");
    let file = reference_file(&conn, space, &original).unwrap();
    let id = file.entity.id;
    let on_phone = scratch("a.pdf");

    let located = locate_on_device(&conn, &id, "phone", &on_phone).unwrap();
    assert_eq!(
        located.path_on_this_device.as_deref(),
        Some(on_phone.to_str().unwrap())
    );
    assert_eq!(located.status.unwrap().state, ReferenceState::Available);

    // The Mac keeps its own path, and the original path is still what was added.
    let mac = facts_for_device(&conn, &id, TEST_DEVICE).unwrap().unwrap();
    assert_eq!(
        mac.path_on_this_device.as_deref(),
        Some(original.to_str().unwrap())
    );
    assert_eq!(mac.remote_id, original.to_str().unwrap());

    // Moving it on the phone and locating again replaces only the phone's path.
    let moved = scratch("b.pdf");
    locate_on_device(&conn, &id, "phone", &moved).unwrap();
    assert_eq!(
        device_path(&conn, &id, "phone").unwrap().as_deref(),
        moved.to_str()
    );
    assert_eq!(
        device_path(&conn, &id, TEST_DEVICE).unwrap().as_deref(),
        original.to_str()
    );
}

#[test]
fn locating_refuses_a_missing_file_a_non_file_and_a_non_reference() {
    let (conn, space) = setup();
    let file = reference_file(&conn, space.clone(), &scratch("a.pdf")).unwrap();
    let nothing = std::env::temp_dir().join("nookly-no-such-file");
    assert!(locate_on_device(&conn, &file.entity.id, "d", &nothing).is_err());
    assert_eq!(device_path(&conn, &file.entity.id, "d").unwrap(), None);

    let link =
        create_reference(&conn, space.clone(), PROVIDER_LINK, "https://a.dev", None).unwrap();
    assert!(locate_on_device(&conn, &link.entity.id, "d", &scratch("x")).is_err());

    let note = crate::db::notes::create_page(&conn, space, "note", "N".into()).unwrap();
    assert!(locate_on_device(&conn, &note.id, "d", &scratch("x")).is_err());
}

#[test]
fn upgraded_references_are_adopted_by_the_device_once() {
    let (conn, space) = setup();
    let path = scratch("legacy.pdf");
    let file = reference_file(&conn, space, &path).unwrap();
    // As the migration leaves a pointer File: a reference with no device attached.
    conn.execute("DELETE FROM reference_device_paths", [])
        .unwrap();
    conn.execute("UPDATE entity_references SET origin_device_id = NULL", [])
        .unwrap();

    assert_eq!(adopt_legacy(&conn, "mac").unwrap(), 1);
    assert_eq!(
        device_path(&conn, &file.entity.id, "mac")
            .unwrap()
            .as_deref(),
        path.to_str()
    );
    // Done: another device starting later does not claim the same reference.
    assert_eq!(adopt_legacy(&conn, "phone").unwrap(), 0);
    assert_eq!(device_path(&conn, &file.entity.id, "phone").unwrap(), None);
    // A path the device was already given is not overwritten.
    let other = scratch("kept.pdf");
    conn.execute("UPDATE entity_references SET origin_device_id = NULL", [])
        .unwrap();
    set_device_path(&conn, &file.entity.id, "mac", other.to_str().unwrap()).unwrap();
    adopt_legacy(&conn, "mac").unwrap();
    assert_eq!(
        device_path(&conn, &file.entity.id, "mac")
            .unwrap()
            .as_deref(),
        other.to_str()
    );
}

#[test]
fn checking_without_moodle_looks_at_files_and_links_and_refuses_moodle() {
    let (conn, space) = setup();
    let path = scratch("c.pdf");
    let file = reference_file(&conn, space.clone(), &path).unwrap();
    let status = check_without_moodle(&conn, &file.entity.id, TEST_DEVICE).unwrap();
    assert_eq!(status.state, ReferenceState::Available);
    std::fs::remove_file(&path).unwrap();
    let status = check_without_moodle(&conn, &file.entity.id, TEST_DEVICE).unwrap();
    assert_eq!(status.state, ReferenceState::Missing);
    assert_eq!(
        facts_for_device(&conn, &file.entity.id, TEST_DEVICE)
            .unwrap()
            .unwrap()
            .last_result
            .as_deref(),
        Some("missing")
    );

    let course = create_reference(&conn, space, PROVIDER_MOODLE_COURSE, "7", None).unwrap();
    assert!(check_without_moodle(&conn, &course.entity.id, TEST_DEVICE).is_err());
}

#[test]
fn a_reference_is_trashed_with_the_rest_and_never_erased_by_itself() {
    let (conn, space) = setup();
    let r = create_reference(&conn, space, PROVIDER_LINK, "https://a.dev", None).unwrap();
    crate::db::entities::soft_delete_entity(&conn, &r.entity.id).unwrap();
    // Soft deleted: the record is still there to restore.
    assert!(get_reference(&conn, &r.entity.id).is_ok());
    assert!(list_references(&conn, &r.entity.space_id)
        .unwrap()
        .is_empty());
    crate::db::entities::restore_entity(&conn, &r.entity.id).unwrap();
    assert_eq!(list_references(&conn, &r.entity.space_id).unwrap().len(), 1);

    // Only emptying Trash by hand removes the rows, all of them.
    crate::db::entities::soft_delete_entity(&conn, &r.entity.id).unwrap();
    crate::db::entities::empty_trash(&conn).unwrap();
    for table in ["entity_references", "reference_device_paths"] {
        let rows: i64 = conn
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
            .unwrap();
        assert_eq!(rows, 0, "{table}");
    }
}

// --- Files that only point elsewhere ----------------------------------------------------

#[test]
fn a_referenced_file_carries_its_reference_and_this_devices_path() {
    let (conn, space) = setup();
    let path = scratch("slides.pdf");
    let file = reference_file(&conn, space.clone(), &path).unwrap();
    assert_eq!(file.source_path.as_deref(), path.to_str());
    let reference = file.reference.expect("a reference");
    assert_eq!(reference.provider, PROVIDER_FILE);
    assert_eq!(reference.status.unwrap().state, ReferenceState::Available);
    let listed = crate::db::files::list_files(&conn, &space).unwrap();
    assert_eq!(
        listed[0].reference.as_ref().unwrap().remote_id,
        path.to_str().unwrap()
    );
    // Its type, id and key are those of a File: the Files page reads the same.
    assert_eq!(file.entity.entity_type, "file");
    assert!(file.entity.key.starts_with("FIL-"));
}

#[test]
fn a_file_stored_in_nookly_has_no_reference() {
    let (conn, space) = setup();
    let dir = std::env::temp_dir().join(format!("nookly-ref-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = crate::db::files::import_file(&conn, &dir, space, &scratch("m.pdf")).unwrap();
    assert!(file.reference.is_none());
}

#[test]
fn a_file_added_on_another_device_is_not_on_this_one_until_located() {
    let (conn, space) = setup();
    let path = scratch("report.pdf");
    let file = reference_file(&conn, space, &path).unwrap();
    let id = file.entity.id;
    // What a record that arrived from another device looks like here: no path of ours.
    conn.execute("DELETE FROM reference_device_paths", [])
        .unwrap();
    conn.execute(
        "UPDATE entity_references SET origin_device_id = 'laptop'",
        [],
    )
    .unwrap();

    let file = crate::db::files::get_file(&conn, &id).unwrap();
    assert_eq!(
        file.source_path, None,
        "the other device's path is not ours"
    );
    assert_eq!(file.local_path, None);
    assert_eq!(
        file.reference
            .as_ref()
            .unwrap()
            .status
            .as_ref()
            .unwrap()
            .state,
        ReferenceState::NotOnThisDevice
    );
    // Copying it in needs the file on this device first.
    let err = crate::db::files::copy_into_storage(&conn, &std::env::temp_dir(), &id)
        .unwrap_err()
        .to_string();
    assert!(err.contains("locate"), "{err}");

    let here = scratch("report.pdf");
    let file = crate::db::files::locate_file(&conn, &id, &here).unwrap();
    assert_eq!(file.source_path.as_deref(), here.to_str());
    assert_eq!(
        file.reference.unwrap().status.unwrap().state,
        ReferenceState::Available
    );
}

#[test]
fn copying_into_nookly_makes_it_a_stored_file_and_keeps_the_record() {
    let (conn, space) = setup();
    let path = scratch("copy-me.pdf");
    let file = reference_file(&conn, space, &path).unwrap();
    let dir = std::env::temp_dir().join(format!("nookly-ref-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let copied = crate::db::files::copy_into_storage(&conn, &dir, &file.entity.id).unwrap();
    assert!(copied.local_path.is_some());
    assert!(copied.reference.is_none(), "it is no longer a pointer");
    // Nothing is dropped: the original path stays on record.
    assert_eq!(copied.source_path.as_deref(), path.to_str());
    let kept: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM entity_references WHERE entity_id = ?1",
            [&file.entity.id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(kept, 1);
    // A stored file cannot be located.
    assert!(crate::db::files::locate_file(&conn, &file.entity.id, &scratch("x")).is_err());
}

#[test]
fn a_moved_file_reads_missing_and_locating_finds_it_again() {
    let (conn, space) = setup();
    let path = scratch("moving.pdf");
    let file = reference_file(&conn, space, &path).unwrap();
    std::fs::remove_file(&path).unwrap();
    let missing = crate::db::files::get_file(&conn, &file.entity.id).unwrap();
    assert_eq!(
        missing.reference.unwrap().status.unwrap().state,
        ReferenceState::Missing
    );
    let new_home = scratch("moved.pdf");
    let found = crate::db::files::locate_file(&conn, &file.entity.id, &new_home).unwrap();
    assert_eq!(
        found.reference.unwrap().status.unwrap().state,
        ReferenceState::Available
    );
    assert_eq!(found.entity.id, file.entity.id);
}

#[test]
fn the_cli_describes_references_and_runs_locate_and_check() {
    let defs: Vec<&str> = inventory::iter::<crate::db::schema::EntitySchemaDef>()
        .map(|d| d.entity_type)
        .collect();
    assert!(defs.contains(&"reference"));
    for entity_type in ["reference", "file"] {
        let names: Vec<&str> = crate::db::schema::entity_actions(entity_type)
            .iter()
            .map(|a| a.name)
            .collect();
        assert!(
            names.contains(&"locate") && names.contains(&"check"),
            "{entity_type}"
        );
    }
}

#[test]
fn every_file_says_whether_it_is_found_a_stored_copy_included() {
    let (conn, space) = setup();
    let dir = std::env::temp_dir().join(format!("nookly-ref-{}", crate::db::new_id()));
    std::fs::create_dir_all(&dir).unwrap();
    let stored =
        crate::db::files::import_file(&conn, &dir, space.clone(), &scratch("s.pdf")).unwrap();
    assert!(stored.reference.is_none());
    assert_eq!(
        stored.availability.as_ref().unwrap().state,
        ReferenceState::Available
    );

    // The stored bytes were deleted behind Nookly's back.
    std::fs::remove_file(stored.local_path.as_ref().unwrap()).unwrap();
    let gone = crate::db::files::get_file(&conn, &stored.entity.id).unwrap();
    assert_eq!(gone.availability.unwrap().state, ReferenceState::Missing);

    // A pointer's availability is its reference's state.
    let pointer = reference_file(&conn, space.clone(), &scratch("p.pdf")).unwrap();
    assert_eq!(pointer.availability, pointer.reference.unwrap().status);

    // A link never downloaded needs the network to be asked: no answer yet.
    conn.execute("UPDATE files SET local_path = NULL, source_path = NULL, url = 'https://a.dev/x.pdf' WHERE entity_id = ?1", [&stored.entity.id]).unwrap();
    conn.execute("INSERT INTO entity_references (entity_id, provider, remote_id) VALUES (?1, 'link', 'https://a.dev/x.pdf')", [&stored.entity.id]).unwrap();
    let link = crate::db::files::get_file(&conn, &stored.entity.id).unwrap();
    assert_eq!(link.availability, None);
    assert_eq!(link.reference.unwrap().provider, "link");
}
