use super::*;

#[test]
fn a_markdown_export_drops_the_colour_of_a_highlight() {
    let block = |block_type: &str, content: &str| Block {
        id: "b".into(),
        entity_id: "e".into(),
        position: 0,
        block_type: block_type.into(),
        content: content.into(),
        language: None,
        filename: None,
        attrs: BlockAttrs::new(),
        created_at: String::new(),
        updated_at: String::new(),
    };
    assert_eq!(
        block_to_markdown(&block(
            "paragraph",
            "a =={green}b== and =={pink}c== d ==e=="
        )),
        "a ==b== and ==c== d ==e=="
    );
    assert_eq!(
        block_to_markdown(&block("bulleted_list", "=={blue}one==\ntwo")),
        "- ==one==\n- two"
    );
    assert_eq!(
        block_to_markdown(&block("heading2", "=={orange}Title==")),
        "## ==Title=="
    );
    // Code is text, and so is a formula.
    assert!(block_to_markdown(&block("code", "x =={green}")).contains("=={green}"));
    assert_eq!(
        block_to_markdown(&block("math", "a =={b}")),
        "$$\na =={b}\n$$"
    );
}

#[test]
fn a_text_colour_is_left_out_of_the_markdown_export() {
    let block = |block_type: &str, content: &str| Block {
        id: "b".into(),
        entity_id: "e".into(),
        position: 0,
        block_type: block_type.into(),
        content: content.into(),
        language: None,
        filename: None,
        attrs: BlockAttrs::new(),
        created_at: String::new(),
        updated_at: String::new(),
    };
    assert_eq!(
        block_to_markdown(&block("paragraph", "a {red}b **c**{/} d {blue}e{/}")),
        "a b **c** d e"
    );
    assert_eq!(
        block_to_markdown(&block("bulleted_list", "{green}one{/}\ntwo")),
        "- one\n- two"
    );
    // Not a colour this version knows, and code is text.
    assert_eq!(
        block_to_markdown(&block("paragraph", "{chartreuse}x{/}")),
        "{chartreuse}x{/}"
    );
    assert!(block_to_markdown(&block("code", "{red}x{/}")).contains("{red}x{/}"));
}

#[test]
fn a_preamble_goes_in_front_of_the_markdown_and_nothing_is_added_without_one() {
    assert_eq!(
        with_preamble(
            Some("$$\n\\newcommand{\\N}{\\mathbb{N}}\n$$"),
            "Hi $\\N$".into()
        ),
        "$$\n\\newcommand{\\N}{\\mathbb{N}}\n$$\n\nHi $\\N$"
    );
    assert_eq!(with_preamble(None, "Hi".into()), "Hi");
    assert_eq!(with_preamble(Some("  \n"), "Hi".into()), "Hi");
}

#[test]
fn note_code_language_defaults_to_none_and_can_be_set_and_cleared() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "S");
    let note = create_page(&conn, space.id, "note", "N".into()).unwrap();
    assert_eq!(get_note_code_language(&conn, &note.id).unwrap(), None);

    set_note_code_language(&conn, &note.id, Some(" rust ".into())).unwrap();
    assert_eq!(
        get_note_code_language(&conn, &note.id).unwrap().as_deref(),
        Some("rust")
    );
    set_note_code_language(&conn, &note.id, Some("python".into())).unwrap();
    assert_eq!(
        get_note_code_language(&conn, &note.id).unwrap().as_deref(),
        Some("python")
    );
    set_note_code_language(&conn, &note.id, None).unwrap();
    assert_eq!(get_note_code_language(&conn, &note.id).unwrap(), None);
    set_note_code_language(&conn, &note.id, Some("  ".into())).unwrap();
    assert_eq!(get_note_code_language(&conn, &note.id).unwrap(), None);
}

#[test]
fn note_code_language_is_for_notes_only_and_shows_in_cli_get() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "S");
    let jot = create_page(&conn, space.id.clone(), "jot", "J".into()).unwrap();
    assert!(set_note_code_language(&conn, &jot.id, Some("rust".into())).is_err());

    let note = create_page(&conn, space.id, "note", "N".into()).unwrap();
    let mut fields = JsonMap::new();
    fields.insert("codeLanguage".into(), serde_json::json!("go"));
    let updated = cli_update_note(&conn, &note.id, &fields).unwrap();
    assert_eq!(updated["codeLanguage"], "go");
    assert_eq!(cli_get_note(&conn, &note.id).unwrap()["codeLanguage"], "go");
    let mut clear = JsonMap::new();
    clear.insert("codeLanguage".into(), serde_json::Value::Null);
    let cleared = cli_update_note(&conn, &note.id, &clear).unwrap();
    assert!(cleared["codeLanguage"].is_null());
}

#[test]
fn deleting_a_note_forever_removes_its_code_language() {
    let conn = crate::db::test_conn();
    let space = crate::db::test_space(&conn, "S");
    let note = create_page(&conn, space.id, "note", "N".into()).unwrap();
    set_note_code_language(&conn, &note.id, Some("rust".into())).unwrap();
    crate::db::entities::soft_delete_entity(&conn, &note.id).unwrap();
    crate::db::entities::hard_delete_entity(&conn, &note.id).unwrap();
    let rows: i64 = conn
        .query_row("SELECT COUNT(*) FROM note_settings", [], |r| r.get(0))
        .unwrap();
    assert_eq!(rows, 0);
}

#[test]
fn refine_jot_creates_linked_note_and_leaves_jot_alone() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let jot = create_page(&conn, space.id.clone(), "jot", "Raw idea".into()).unwrap();
    create_block(
        &conn,
        &jot.id,
        "paragraph".into(),
        "keep me".into(),
        None,
        None,
        None,
    )
    .unwrap();
    let note = refine_jot(&conn, &jot.id, Some("Clean idea")).unwrap();
    assert_eq!(
        (note.entity_type.as_str(), note.title.as_str()),
        ("note", "Clean idea")
    );
    assert_eq!(note.space_id, space.id);
    let link: (String, String, String) = conn
        .query_row(
            "SELECT from_entity_id, to_entity_id, relationship_type FROM relationships",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .unwrap();
    assert_eq!(link, (jot.id.clone(), note.id.clone(), "relates-to".into()));
    assert_eq!(count_unrefined_jots(&conn, &space.id).unwrap(), 0);
    let after = crate::db::entities::get_entity(&conn, &jot.id).unwrap();
    assert_eq!((after.title, after.updated_at), (jot.title, jot.updated_at));
    assert_eq!(list_blocks(&conn, &jot.id).unwrap().len(), 1);
    // Default title, and a non jot is refused.
    let again = refine_jot(&conn, &jot.id, None).unwrap();
    assert_eq!(again.title, "Raw idea");
    assert!(refine_jot(&conn, &note.id, None).is_err());
}

#[test]
fn note_summaries_carry_preview_recency_and_labels() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let empty = create_page(&conn, space.id.clone(), "note", "Empty".into()).unwrap();
    let page = create_page(&conn, space.id.clone(), "note", "Lecture 1".into()).unwrap();
    create_page(&conn, space.id.clone(), "jot", "Not a note".into()).unwrap();
    create_block(
        &conn,
        &page.id,
        "code".into(),
        "let x = 1;".into(),
        None,
        None,
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        "  ".into(),
        None,
        None,
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        "First line".into(),
        None,
        None,
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &page.id,
        "quote".into(),
        "Second".into(),
        None,
        None,
        None,
    )
    .unwrap();
    let label =
        crate::db::labels::create_label(&conn, space.id.clone(), "Exam".into(), "#f00".into())
            .unwrap();
    crate::db::labels::attach_label(&conn, &page.id, &label.id).unwrap();

    let summaries = list_note_summaries(&conn, &space.id).unwrap();
    assert_eq!(summaries.len(), 2);
    let lecture = summaries.iter().find(|s| s.entity.id == page.id).unwrap();
    assert_eq!(lecture.preview, "First line\nSecond");
    assert_eq!(lecture.label_ids, vec![label.id]);
    assert!(lecture.last_edited_at >= lecture.entity.updated_at);
    let blank = summaries.iter().find(|s| s.entity.id == empty.id).unwrap();
    assert!(blank.preview.is_empty() && blank.label_ids.is_empty());
}

#[test]
fn note_summaries_carry_courses_linked_directly_or_through_a_session() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let algorithms =
        crate::db::courses::create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
    let databases =
        crate::db::courses::create_course(&conn, space.id.clone(), "Databases".into()).unwrap();
    let dropped =
        crate::db::courses::create_course(&conn, space.id.clone(), "Dropped".into()).unwrap();
    let direct = create_page(&conn, space.id.clone(), "note", "Direct".into()).unwrap();
    let loose = create_page(&conn, space.id.clone(), "note", "Loose".into()).unwrap();
    for course in [&algorithms, &dropped] {
        crate::db::relationships::create_relationship(
            &conn,
            course.id.clone(),
            direct.id.clone(),
            "course-notes".into(),
            None,
            None,
        )
        .unwrap();
    }
    crate::db::entities::soft_delete_entity(&conn, &dropped.id).unwrap();
    let session = crate::db::sessions::create_one_off_session(
        &conn,
        space.id.clone(),
        "Lecture".into(),
        databases.id.clone(),
        "2026-09-21".into(),
        "10:00".into(),
        "11:30".into(),
        None,
    )
    .unwrap();
    let session_note = crate::db::sessions::create_session_page(
        &conn,
        &session.entity.id,
        "note",
        "Lecture notes".into(),
    )
    .unwrap();

    let summaries = list_note_summaries(&conn, &space.id).unwrap();
    let courses_of = |id: &str| {
        let summary = summaries.iter().find(|s| s.entity.id == id).unwrap();
        summary
            .courses
            .iter()
            .map(|c| c.title.clone())
            .collect::<Vec<_>>()
    };
    assert_eq!(courses_of(&direct.id), vec!["Algorithms"]);
    assert_eq!(courses_of(&session_note.id), vec!["Databases"]);
    assert!(courses_of(&loose.id).is_empty());
}

#[test]
fn jot_summaries_carry_links_sessions_and_unrefined_count() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let jot = create_page(&conn, space.id.clone(), "jot", "".into()).unwrap();
    let loose = create_page(&conn, space.id.clone(), "jot", "".into()).unwrap();
    let note = create_page(&conn, space.id.clone(), "note", "Polished".into()).unwrap();
    let other = create_page(&conn, space.id.clone(), "note", "Unrelated".into()).unwrap();
    let course =
        crate::db::courses::create_course(&conn, space.id.clone(), "Algorithms".into()).unwrap();
    let session = crate::db::sessions::create_one_off_session(
        &conn,
        space.id.clone(),
        "Lecture".into(),
        course.id.clone(),
        "2026-09-21".into(),
        "10:00".into(),
        "11:30".into(),
        None,
    )
    .unwrap();
    // Note to Jot, so the reverse direction has to count as a link too.
    crate::db::relationships::create_relationship(
        &conn,
        note.id.clone(),
        jot.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    crate::db::relationships::create_relationship(
        &conn,
        jot.id.clone(),
        session.entity.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    // Jot to Jot is not a refinement.
    crate::db::relationships::create_relationship(
        &conn,
        loose.id.clone(),
        jot.id.clone(),
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();

    let summaries = list_jot_summaries(&conn, &space.id).unwrap();
    assert_eq!(summaries.len(), 2);
    let linked_jot = summaries.iter().find(|s| s.entity.id == jot.id).unwrap();
    assert_eq!(linked_jot.linked.len(), 1);
    assert_eq!(linked_jot.linked[0].id, note.id);
    let context = linked_jot.session.as_ref().unwrap();
    assert_eq!(context.entity.id, session.entity.id);
    assert_eq!(context.course_title.as_deref(), Some("Algorithms"));
    let alone = summaries.iter().find(|s| s.entity.id == loose.id).unwrap();
    assert!(alone.linked.is_empty() && alone.session.is_none());
    assert_eq!(count_unrefined_jots(&conn, &space.id).unwrap(), 1);
    assert!(summaries.iter().all(|s| s.entity.id != other.id));
}

#[test]
fn unrefined_jots_across_spaces_list_the_oldest_first() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let newer = create_page(&conn, space.id.clone(), "jot", "".into()).unwrap();
    let older = create_page(&conn, space.id.clone(), "jot", "".into()).unwrap();
    conn.execute(
        "UPDATE entities SET created_at = '2020-01-01T00:00:00Z' WHERE id = ?1",
        params![older.id],
    )
    .unwrap();
    conn.execute(
        "UPDATE entities SET created_at = '2021-01-01T00:00:00Z' WHERE id = ?1",
        params![newer.id],
    )
    .unwrap();
    let jots = list_unrefined_jots_all_spaces(&conn, 10).unwrap();
    let ids: Vec<_> = jots.iter().map(|j| j.entity.id.as_str()).collect();
    assert_eq!(ids, vec![older.id.as_str(), newer.id.as_str()]);
}

#[test]
fn unrefined_jots_across_spaces_carry_previews() {
    let conn = crate::db::test_conn();
    let study =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let home = crate::db::spaces::create_space(&conn, "Home".into(), None, "#fff".into()).unwrap();
    let raw = create_page(&conn, study.id.clone(), "jot", "".into()).unwrap();
    let other = create_page(&conn, home.id.clone(), "jot", "".into()).unwrap();
    let refined = create_page(&conn, study.id.clone(), "jot", "".into()).unwrap();
    let note = create_page(&conn, study.id.clone(), "note", "Clean".into()).unwrap();
    crate::db::relationships::create_relationship(
        &conn,
        refined.id.clone(),
        note.id,
        "relates-to".into(),
        None,
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &raw.id,
        "paragraph".into(),
        "Dijkstra needs non negative weights".into(),
        None,
        None,
        None,
    )
    .unwrap();

    let jots = list_unrefined_jots_all_spaces(&conn, 10).unwrap();
    let ids: Vec<_> = jots.iter().map(|j| j.entity.id.as_str()).collect();
    assert_eq!(jots.len(), 2);
    assert!(ids.contains(&raw.id.as_str()) && ids.contains(&other.id.as_str()));
    let with_text = jots.iter().find(|j| j.entity.id == raw.id).unwrap();
    assert_eq!(with_text.preview, "Dijkstra needs non negative weights");
    assert_eq!(list_unrefined_jots_all_spaces(&conn, 1).unwrap().len(), 1);
}

#[test]
fn markdown_export_covers_every_block_type() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(&conn, space.id, "note", "Lecture 1".into()).unwrap();

    create_block(
        &conn,
        &page.id,
        "heading1".into(),
        "Intro".into(),
        None,
        None,
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        "Some text.".into(),
        None,
        None,
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &page.id,
        "code".into(),
        "fn main() {}".into(),
        None,
        Some("rust".into()),
        Some("main.rs".into()),
    )
    .unwrap();

    let markdown = render_page_markdown(&conn, &page.id).unwrap();
    assert!(markdown.contains("# Intro"));
    assert!(markdown.contains("Some text."));
    assert!(markdown.contains("```rust filename=\"main.rs\"\nfn main() {}\n```"));
}

#[test]
fn reorder_changes_export_order() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(&conn, space.id, "note", "Lecture 1".into()).unwrap();

    let first = create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        "First".into(),
        None,
        None,
        None,
    )
    .unwrap();
    let second = create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        "Second".into(),
        None,
        None,
        None,
    )
    .unwrap();

    reorder_blocks(&conn, &page.id, vec![second.id, first.id]).unwrap();
    let markdown = render_page_markdown(&conn, &page.id).unwrap();
    assert!(markdown.find("Second").unwrap() < markdown.find("First").unwrap());
}

#[test]
fn update_block_patches_only_given_fields() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(&conn, space.id, "note", "Lecture 1".into()).unwrap();
    let block = create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        "Intro".into(),
        None,
        None,
        None,
    )
    .unwrap();

    let content_only = update_block(
        &conn,
        &block.id,
        BlockPatch {
            content: Some("Intro.".into()),
            block_type: None,
            language: None,
            filename: None,
            attrs: None,
        },
    )
    .unwrap();
    assert_eq!(content_only.content, "Intro.");
    assert_eq!(content_only.block_type, "paragraph");

    let retyped = update_block(
        &conn,
        &block.id,
        BlockPatch {
            content: None,
            block_type: Some("heading1".into()),
            language: None,
            filename: None,
            attrs: None,
        },
    )
    .unwrap();
    assert_eq!(retyped.content, "Intro.");
    assert_eq!(retyped.block_type, "heading1");
}

#[test]
fn list_mentioning_entities_finds_backlinks_and_excludes_self_and_deleted() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let target = create_page(&conn, space.id.clone(), "note", "Target".into()).unwrap();
    let mentioner = create_page(&conn, space.id.clone(), "note", "Mentioner".into()).unwrap();
    let deleted_mentioner = create_page(&conn, space.id.clone(), "note", "Deleted".into()).unwrap();
    let unrelated = create_page(&conn, space.id.clone(), "note", "Unrelated".into()).unwrap();

    create_block(
        &conn,
        &mentioner.id,
        "paragraph".into(),
        format!("See [Target](mention:{})", target.id),
        None,
        None,
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &deleted_mentioner.id,
        "paragraph".into(),
        format!("See [Target](mention:{})", target.id),
        None,
        None,
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &unrelated.id,
        "paragraph".into(),
        "No links here".into(),
        None,
        None,
        None,
    )
    .unwrap();
    crate::db::entities::soft_delete_entity(&conn, &deleted_mentioner.id).unwrap();

    let mentioning = list_mentioning_entities(&conn, &target.id).unwrap();
    assert_eq!(mentioning.len(), 1);
    assert_eq!(mentioning[0].id, mentioner.id);
}

#[test]
fn mention_index_follows_block_edits_and_deletes() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let target = create_page(&conn, space.id.clone(), "note", "Target".into()).unwrap();
    let mentioner = create_page(&conn, space.id.clone(), "note", "Mentioner".into()).unwrap();
    let link = format!("See [Target](mention:{})", target.id);

    let first = create_block(
        &conn,
        &mentioner.id,
        "paragraph".into(),
        link.clone(),
        None,
        None,
        None,
    )
    .unwrap();
    let second = create_block(
        &conn,
        &mentioner.id,
        "paragraph".into(),
        link,
        None,
        None,
        None,
    )
    .unwrap();
    assert_eq!(
        list_mentioning_entities(&conn, &target.id).unwrap().len(),
        1
    );

    update_block(
        &conn,
        &first.id,
        BlockPatch {
            content: Some("No link anymore".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(
        list_mentioning_entities(&conn, &target.id).unwrap().len(),
        1
    );

    delete_block(&conn, &second.id).unwrap();
    assert!(list_mentioning_entities(&conn, &target.id)
        .unwrap()
        .is_empty());
}

#[test]
fn export_points_file_mentions_at_the_file() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(&conn, space.id.clone(), "note", "Doc".into()).unwrap();
    let other = create_page(&conn, space.id.clone(), "note", "Other".into()).unwrap();
    let file = crate::db::files::store_file(
        &conn,
        &std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id())),
        space.id,
        "slides.pdf",
        b"%PDF",
        Some("https://example.com/slides.pdf"),
    )
    .unwrap();
    create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        format!(
            "See [Slides](mention:{}) and [Other](mention:{})",
            file.entity.id, other.id
        ),
        None,
        None,
        None,
    )
    .unwrap();

    let markdown = render_page_markdown(&conn, &page.id).unwrap();
    // The stored copy wins over the link it was downloaded from.
    assert!(markdown.contains("[Slides](file://"));
    // A mention of a page is written out with its readable key, not the id it is stored with.
    assert!(markdown.contains(&format!("[Other](mention:{})", other.key)));
}

#[test]
fn export_keeps_the_page_of_a_file_mention() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(&conn, space.id.clone(), "note", "Doc".into()).unwrap();
    let file = crate::db::files::store_file(
        &conn,
        &std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id())),
        space.id,
        "slides.pdf",
        b"%PDF",
        None,
    )
    .unwrap();
    create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        format!("See [Slides (p. 12)](mention:{}#p12).", file.entity.id),
        None,
        None,
        None,
    )
    .unwrap();

    let markdown = render_page_markdown(&conn, &page.id).unwrap();
    assert!(markdown.contains("[Slides (p. 12)](file://"), "{markdown}");
    assert!(markdown.contains(".pdf#p12)"), "{markdown}");
    assert!(!markdown.contains("mention:"), "{markdown}");
}

#[test]
fn export_leaves_a_page_mention_of_something_else_alone() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(&conn, space.id.clone(), "note", "Doc".into()).unwrap();
    let other = create_page(&conn, space.id, "note", "Other".into()).unwrap();
    create_block(
        &conn,
        &page.id,
        "paragraph".into(),
        format!("See [Other](mention:{}#p12).", other.id),
        None,
        None,
        None,
    )
    .unwrap();
    let markdown = render_page_markdown(&conn, &page.id).unwrap();
    // Written with the readable key; what is not a file keeps its fragment.
    assert!(markdown.contains(&format!("[Other](mention:{}#p12)", other.key)));
}

#[test]
fn extract_mention_ids_reads_a_file_page_mention() {
    let ids = extract_mention_ids("[Slides (p. 3)](mention:abc-123#p3) and [x](mention:def)");
    assert_eq!(ids.into_iter().collect::<Vec<_>>(), ["abc-123", "def"]);
}

#[test]
fn block_to_markdown_renders_a_table_block() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(&conn, space.id, "note", "Doc".into()).unwrap();
    let block = create_block(
        &conn,
        &page.id,
        "table".into(),
        "Name\tAge\nAlice\t30\nBob\t25".into(),
        None,
        None,
        None,
    )
    .unwrap();

    let markdown = block_to_markdown(&block);
    assert_eq!(
        markdown,
        "| Name | Age |\n|---|---|\n| Alice | 30 |\n| Bob | 25 |"
    );
}

fn mindmap_with_layout(conn: &Connection, content: &str, layout: &str) -> Block {
    let space = crate::db::spaces::create_space(conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(conn, space.id, "note", "Maps".into()).unwrap();
    create_block_with_attrs(
        conn,
        &page.id,
        "mindmap".into(),
        content.into(),
        None,
        None,
        None,
        BlockAttrs::from([("layout".to_string(), layout.to_string())]),
    )
    .unwrap()
}

const MAP_LAYOUT: &str = r#"{"v":1,"ids":["p","r","w"],"positions":{"w":{"x":12.0,"y":8.0}}}"#;

fn patch_content(content: &str, attrs: Option<BlockAttrs>) -> BlockPatch {
    BlockPatch {
        content: Some(content.into()),
        attrs,
        ..BlockPatch::default()
    }
}

#[test]
fn an_outline_edited_from_outside_the_editor_keeps_where_nodes_were_dragged() {
    let conn = crate::db::test_conn();
    let block = mindmap_with_layout(&conn, "Plan\n  Read\n  Write", MAP_LAYOUT);
    let updated = update_block(
        &conn,
        &block.id,
        patch_content("Plan\n  Read\n  Draft\n  Write", None),
    )
    .unwrap();
    let layout: serde_json::Value = serde_json::from_str(&updated.attrs["layout"]).unwrap();
    let ids: Vec<&str> = layout["ids"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap())
        .collect();
    assert_eq!((ids[0], ids[1], ids[3]), ("p", "r", "w"));
    assert_eq!(ids.len(), 4);
    assert_eq!(
        layout["positions"],
        serde_json::json!({ "w": { "x": 12.0, "y": 8.0 } })
    );
    // What is stored is what was returned.
    assert_eq!(get_block(&conn, &block.id).unwrap().attrs, updated.attrs);
}

#[test]
fn deleting_the_only_moved_line_removes_the_layout() {
    let conn = crate::db::test_conn();
    let block = mindmap_with_layout(&conn, "Plan\n  Read\n  Write", MAP_LAYOUT);
    let updated = update_block(&conn, &block.id, patch_content("Plan\n  Read", None)).unwrap();
    assert!(!updated.attrs.contains_key("layout"));
}

#[test]
fn a_write_that_brings_its_own_layout_is_stored_as_it_is() {
    let conn = crate::db::test_conn();
    let block = mindmap_with_layout(&conn, "Plan\n  Read\n  Write", MAP_LAYOUT);
    let mine = r#"{"v":1,"ids":["a","b"],"positions":{"b":{"x":1.0,"y":2.0}}}"#;
    let updated = update_block(
        &conn,
        &block.id,
        patch_content(
            "Plan\n  Read",
            Some(BlockAttrs::from([("layout".to_string(), mine.to_string())])),
        ),
    )
    .unwrap();
    assert_eq!(updated.attrs["layout"], mine);
}

#[test]
fn changing_only_other_attrs_leaves_the_layout_alone() {
    let conn = crate::db::test_conn();
    let block = mindmap_with_layout(&conn, "Plan\n  Read\n  Write", MAP_LAYOUT);
    let updated = update_block(
        &conn,
        &block.id,
        BlockPatch {
            attrs: Some(BlockAttrs::from([(
                "view".to_string(),
                "rendered".to_string(),
            )])),
            ..BlockPatch::default()
        },
    )
    .unwrap();
    assert_eq!(updated.attrs["layout"], MAP_LAYOUT);
}

#[test]
fn clearing_the_layout_brings_back_the_automatic_one() {
    let conn = crate::db::test_conn();
    let block = mindmap_with_layout(&conn, "Plan\n  Read\n  Write", MAP_LAYOUT);
    let updated = update_block(
        &conn,
        &block.id,
        BlockPatch {
            attrs: Some(BlockAttrs::from([("layout".to_string(), String::new())])),
            ..BlockPatch::default()
        },
    )
    .unwrap();
    assert!(!updated.attrs.contains_key("layout"));
    assert_eq!(updated.content, "Plan\n  Read\n  Write");
}

#[test]
fn an_outline_with_no_layout_is_edited_as_before() {
    let conn = crate::db::test_conn();
    let space =
        crate::db::spaces::create_space(&conn, "Study".into(), None, "#000".into()).unwrap();
    let page = create_page(&conn, space.id, "note", "Maps".into()).unwrap();
    let block = create_block(
        &conn,
        &page.id,
        "mindmap".into(),
        "Plan".into(),
        None,
        None,
        None,
    )
    .unwrap();
    let updated = update_block(&conn, &block.id, patch_content("Plan\n  Read", None)).unwrap();
    assert!(!updated.attrs.contains_key("layout"));
}
