use super::*;

fn run(conn: &Connection, line: &str) -> AppResult<Value> {
    dispatch(conn, line.split_whitespace().map(str::to_string).collect())
}

struct ClosedPipe;
impl std::io::Write for ClosedPipe {
    fn write(&mut self, _: &[u8]) -> std::io::Result<usize> {
        Err(std::io::ErrorKind::BrokenPipe.into())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Err(std::io::ErrorKind::BrokenPipe.into())
    }
}

#[test]
fn closed_stdout_pipe_does_not_panic() {
    // `println!` panics on EPIPE, and release builds abort on panic, which
    // crashed the app when an agent ran `nookly cli ... | head`.
    write_line(&mut ClosedPipe, "{}");
}

#[test]
fn write_line_still_writes_when_the_pipe_is_open() {
    let mut out = Vec::new();
    write_line(&mut out, "{\"ok\":true}");
    assert_eq!(String::from_utf8(out).unwrap(), "{\"ok\":true}\n");
}

#[test]
fn command_failing_flag_validation_writes_nothing() {
    let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
    let conn = crate::db::connect(&dir).unwrap();
    let space =
        crate::db::spaces::create_space(&conn, "Inbox".into(), None, "#000".into()).unwrap();
    let err = run(
        &conn,
        &format!("task create --space {} --title Dup --yes", space.id),
    )
    .unwrap_err()
    .to_string();
    assert!(err.contains("unknown flag"), "{err}");
    let listed = run(&conn, &format!("task list --space {}", space.id)).unwrap();
    assert_eq!(listed["count"], 0);
}

#[test]
fn child_collection_verbs_manage_deck_cards() {
    let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
    let conn = crate::db::connect(&dir).unwrap();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let course =
        crate::db::courses::create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
    let exam = crate::db::exams::create_exam(
        &conn,
        space.id.clone(),
        "Midterm".into(),
        course.id,
        None,
        None,
    )
    .unwrap();
    let deck = crate::db::decks::create_deck(
        &conn,
        space.id.clone(),
        "Deck".into(),
        Some(exam.entity.id.clone()),
    )
    .unwrap();

    let described = run(&conn, "describe index_card_deck").unwrap();
    assert_eq!(described["childCollections"][0]["name"], "cards");

    let card = run(
        &conn,
        &format!(
            "index_card_deck add-card {} --field front=Q --field back=A",
            deck.id
        ),
    )
    .unwrap();
    let card_id = card["id"].as_str().unwrap().to_string();
    assert!(run(
        &conn,
        &format!("index_card_deck add-card {} --field front=Q", deck.id)
    )
    .is_err());

    let updated = run(
        &conn,
        &format!("index_card_deck update-card {card_id} --field back=B"),
    )
    .unwrap();
    assert_eq!(updated["card"]["back"], "B");

    let reviewed = run(
        &conn,
        &format!("index_card_deck review-card {card_id} --field rating=good"),
    )
    .unwrap();
    assert_eq!(reviewed["reps"], 1);
    let undone = run(
        &conn,
        &format!("index_card_deck undo-review-card {card_id}"),
    )
    .unwrap();
    assert_eq!(undone["reps"], 0);

    assert!(run(&conn, &format!("index_card_deck delete-card {card_id}")).is_err());
    run(
        &conn,
        &format!("index_card_deck delete-card {card_id} --yes"),
    )
    .unwrap();
    let listed = run(&conn, &format!("index_card_deck cards {}", deck.key)).unwrap();
    assert_eq!(listed["count"], 0);
    run(&conn, &format!("index_card_deck restore-card {card_id}")).unwrap();

    let copy = run(&conn, &format!("index_card_deck duplicate {}", deck.id)).unwrap();
    assert_eq!(copy["data"]["stats"]["total"], 1);
    assert!(run(&conn, &format!("index_card_deck frobnicate-card {card_id}")).is_err());

    // A deck stands alone, and can be filed under an Exam later or unfiled.
    let loose = run(
        &conn,
        &format!("index_card_deck create --space {} --title Vocab", space.id),
    )
    .unwrap();
    assert!(loose["data"]["examId"].is_null());
    let loose_id = loose["data"]["id"].as_str().unwrap().to_string();
    let filed = run(
        &conn,
        &format!(
            "index_card_deck update {loose_id} --field examId={}",
            exam.entity.key
        ),
    )
    .unwrap();
    assert_eq!(filed["data"]["examId"], exam.entity.id.as_str());
    let unfiled = run(
        &conn,
        &format!("index_card_deck update {loose_id} --field examId="),
    )
    .unwrap();
    assert!(unfiled["data"]["examId"].is_null());
    drop(conn);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn list_filters_by_label_and_rejects_unknown_flags() {
    let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
    let conn = crate::db::connect(&dir).unwrap();
    let space = crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
    let huk = crate::db::labels::create_label(&conn, space.id.clone(), "HUK".into(), "#f00".into())
        .unwrap();
    let insurance =
        crate::db::labels::create_label(&conn, space.id.clone(), "Insurance".into(), "#0f0".into())
            .unwrap();

    let both = run(
        &conn,
        &format!("task create --space {} --title Both", space.id),
    )
    .unwrap();
    let both_id = both["data"]["entity"]["id"].as_str().unwrap().to_string();
    let only_huk = run(
        &conn,
        &format!("task create --space {} --title OnlyHuk", space.id),
    )
    .unwrap();
    let only_huk_id = only_huk["data"]["entity"]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let _neither = run(
        &conn,
        &format!("task create --space {} --title Neither", space.id),
    )
    .unwrap();

    run(
        &conn,
        &format!("label attach {both_id} {} {}", huk.id, insurance.id),
    )
    .unwrap();
    run(&conn, &format!("label attach {only_huk_id} {}", huk.id)).unwrap();

    // A typo'd flag (`--labels` for `--label`) used to parse fine and silently do
    // nothing; it must now be rejected instead.
    let err = run(
        &conn,
        &format!("task list --space {} --labels HUK", space.id),
    )
    .unwrap_err()
    .to_string();
    assert!(err.contains("unknown flag"), "{err}");

    // AND match: only the task carrying both labels comes back.
    let filtered = run(
        &conn,
        &format!("task list --space {} --label HUK,Insurance", space.id),
    )
    .unwrap();
    assert_eq!(filtered["count"], 1);
    assert_eq!(filtered["items"][0]["entity"]["id"], both_id.as_str());

    // Case-insensitive, single name.
    let single = run(
        &conn,
        &format!("task list --space {} --label huk", space.id),
    )
    .unwrap();
    assert_eq!(single["count"], 2);

    // No label at all, or an unknown name, doesn't just come back empty.
    assert!(run(&conn, "task list --label HUK").is_err());
    assert!(run(
        &conn,
        &format!("task list --space {} --label Nope", space.id)
    )
    .is_err());

    // `--fields labels` on `list` now resolves, matching what `get` already returns.
    let projected = run(
        &conn,
        &format!("task list --space {} --fields labels", space.id),
    )
    .unwrap();
    let both_item = projected["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|i| i["id"] == both_id.as_str())
        .unwrap();
    assert!(both_item.get("unknownFields").is_none());
    let names: Vec<&str> = both_item["labels"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| l["name"].as_str().unwrap())
        .collect();
    assert!(
        names.contains(&"HUK") && names.contains(&"Insurance"),
        "{names:?}"
    );

    // The reverse lookup: every entity carrying a label.
    let reverse = run(&conn, &format!("label get {}", huk.id)).unwrap();
    assert_eq!(reverse["count"], 2);

    drop(conn);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn course_block_verbs_edit_the_course_notes_page() {
    let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
    let conn = crate::db::connect(&dir).unwrap();
    let space = crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
    let course =
        crate::db::courses::create_course(&conn, space.id.clone(), "Maths".into()).unwrap();

    let described = run(&conn, "describe course").unwrap();
    assert_eq!(described["supportsBlocks"], true);
    assert_eq!(described["blockPage"]["pageType"], "course_notes");

    let added = run(
        &conn,
        &format!(
            "course add-block {} --type paragraph --content Hello",
            course.id
        ),
    )
    .unwrap();
    let page_id = added["block"]["entityId"].as_str().unwrap().to_string();
    let page = crate::db::entities::get_entity(&conn, &page_id).unwrap();
    assert_eq!(page.entity_type, "course_notes");

    // The course id and the page's own id reach the same blocks.
    for target in [&course.id, &page_id] {
        let blocks = run(&conn, &format!("course blocks {target}")).unwrap();
        assert_eq!(blocks["pageId"], page_id.as_str());
        assert_eq!(blocks["count"], 1);
    }
    // Other entities still refuse them, and notes still reject the page.
    assert!(run(&conn, &format!("course blocks {}", space.id)).is_err());
    assert!(run(&conn, &format!("note blocks {page_id}")).is_err());

    drop(conn);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn jot_refine_entity_action_is_listed_and_dispatches() {
    let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
    let conn = crate::db::connect(&dir).unwrap();
    let space = crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();
    let described = run(&conn, "describe jot").unwrap();
    assert!(described["entityActions"]
        .as_array()
        .unwrap()
        .iter()
        .any(|a| a["name"] == "refine"));

    let jot = crate::db::notes::create_page(&conn, space.id.clone(), "jot", "Raw".into()).unwrap();
    let refined = run(&conn, &format!("jot refine {} --title Clean", jot.id)).unwrap();
    assert_eq!(refined["relationshipType"], "relates-to");
    assert_eq!(refined["note"]["entity"]["title"], "Clean");
    let note_id = refined["note"]["entity"]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let links: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM relationships WHERE from_entity_id = ?1 AND to_entity_id = ?2 AND relationship_type = 'relates-to'",
            [&jot.id, &note_id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(links, 1);
    // A note is not refinable, and nothing is left behind by the failure.
    assert!(run(&conn, &format!("jot refine {note_id}")).is_err());

    drop(conn);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn file_reindex_bulk_action_is_listed_and_dispatches() {
    let dir = std::env::temp_dir().join(format!("nookly-cli-test-{}", crate::db::new_id()));
    let conn = crate::db::connect(&dir).unwrap();
    let space = crate::db::spaces::create_space(&conn, "Work".into(), None, "#000".into()).unwrap();

    let described = run(&conn, "describe file").unwrap();
    let bulk_actions = described["bulkActions"].as_array().unwrap();
    assert!(bulk_actions.iter().any(|a| a["name"] == "reindex"));

    // A blank .docx has nothing to extract, so it starts out needing a reindex.
    let source_dir = dir.join("sources");
    std::fs::create_dir_all(&source_dir).unwrap();
    let source = source_dir.join("blank.docx");
    {
        let file = std::fs::File::create(&source).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        zip.start_file("word/document.xml", options).unwrap();
        std::io::Write::write_all(
            &mut zip,
            br#"<w:document xmlns:w="ns"><w:body></w:body></w:document>"#,
        )
        .unwrap();
        zip.finish().unwrap();
    }
    let created = run(
        &conn,
        &format!(
            "file create --space {} --title Blank --field localPath={}",
            space.id,
            source.display()
        ),
    )
    .unwrap();
    assert_eq!(created["data"]["needsReindex"], true);

    let summary = run(&conn, &format!("file reindex --space {}", space.id)).unwrap();
    assert_eq!(summary["checked"], 1);
    assert_eq!(summary["reindexed"], 0);

    assert!(run(&conn, "file frobnicate").is_err());

    drop(conn);
    let _ = std::fs::remove_dir_all(dir);
}
