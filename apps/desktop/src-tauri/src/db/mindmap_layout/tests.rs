use super::*;

/// Ids that count up, so a test shows who kept what.
fn counter() -> impl FnMut() -> String {
    let mut n = 0;
    move || {
        n += 1;
        format!("n{n}")
    }
}

fn layout(ids: &[&str], positions: &[(&str, f64, f64)]) -> String {
    let positions: serde_json::Map<String, Value> = positions
        .iter()
        .map(|(id, x, y)| (id.to_string(), json!({ "x": x, "y": y })))
        .collect();
    json!({ "v": 1, "ids": ids, "positions": positions }).to_string()
}

fn ids_of(raw: &str) -> Vec<String> {
    let value: Value = serde_json::from_str(raw).unwrap();
    value["ids"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| id.as_str().unwrap().to_string())
        .collect()
}

fn positions_of(raw: &str) -> Value {
    serde_json::from_str::<Value>(raw).unwrap()["positions"].clone()
}

const OLD: &str = "Plan\n  Read\n  Write\n  Rest";

fn base() -> String {
    layout(&["p", "r", "w", "e"], &[("r", 10.0, 5.0), ("w", -4.0, 8.0)])
}

fn follow(after: &str) -> String {
    reconcile(OLD, after, &base(), &mut counter())
}

#[test]
fn nothing_changed_keeps_the_layout_as_stored() {
    assert_eq!(follow(OLD), base());
}

#[test]
fn a_new_line_gets_a_fresh_id_and_the_others_keep_theirs() {
    let next = follow("Plan\n  Read\n  Draft\n  Write\n  Rest");
    assert_eq!(ids_of(&next), ["p", "r", "n1", "w", "e"]);
    assert_eq!(
        positions_of(&next),
        json!({ "r": { "x": 10.0, "y": 5.0 }, "w": { "x": -4.0, "y": 8.0 } })
    );
}

#[test]
fn a_deleted_line_loses_its_id_and_position() {
    let next = follow("Plan\n  Read\n  Rest");
    assert_eq!(ids_of(&next), ["p", "r", "e"]);
    assert_eq!(positions_of(&next), json!({ "r": { "x": 10.0, "y": 5.0 } }));
}

#[test]
fn a_line_edited_in_place_keeps_its_id() {
    let renamed = follow("Plan\n  Read more\n  Write\n  Rest");
    assert_eq!(ids_of(&renamed), ["p", "r", "w", "e"]);
    assert_eq!(positions_of(&renamed)["r"], json!({ "x": 10.0, "y": 5.0 }));
    // Indenting a line changes its text too.
    let indented = follow("Plan\n  Read\n    Write\n  Rest");
    assert_eq!(ids_of(&indented), ["p", "r", "w", "e"]);
}

#[test]
fn reordered_lines_keep_their_ids() {
    let next = follow("Plan\n  Write\n  Rest\n  Read");
    assert_eq!(ids_of(&next), ["p", "w", "e", "r"]);
    assert_eq!(
        positions_of(&next),
        json!({ "r": { "x": 10.0, "y": 5.0 }, "w": { "x": -4.0, "y": 8.0 } })
    );
}

#[test]
fn an_insert_next_to_an_edit_keeps_the_lines_around_them() {
    let next = follow("Plan\n  Read\n  Write now\n  Also\n  Rest");
    let ids = ids_of(&next);
    assert_eq!((&ids[0][..], &ids[1][..], &ids[4][..]), ("p", "r", "e"));
    assert_eq!(
        ids.iter().collect::<std::collections::HashSet<_>>().len(),
        5
    );
}

#[test]
fn an_empty_layout_is_dropped() {
    let only = layout(&["p", "r"], &[("r", 1.0, 1.0)]);
    assert_eq!(reconcile("Plan\n  Read", "Plan", &only, &mut counter()), "");
}

#[test]
fn it_is_deterministic_and_never_reuses_an_id() {
    let raw = layout(&["1", "2", "3", "4"], &[("2", 3.0, 3.0)]);
    let a = reconcile("a\na\na\nb", "a\na\nb\na\na", &raw, &mut counter());
    let b = reconcile("a\na\na\nb", "a\na\nb\na\na", &raw, &mut counter());
    assert_eq!(a, b);
    assert_eq!(
        ids_of(&a)
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        5
    );
}

#[test]
fn a_generator_that_repeats_itself_still_ends() {
    let raw = layout(&["1"], &[("1", 3.0, 3.0)]);
    let next = reconcile("a", "a\nb\nc", &raw, &mut || "same".to_string());
    assert_eq!(
        ids_of(&next)
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        3
    );
}

#[test]
fn a_layout_from_a_newer_version_is_left_alone() {
    let future = json!({ "v": 2, "anything": true }).to_string();
    assert_eq!(reconcile(OLD, "Plan", &future, &mut counter()), future);
}

#[test]
fn ids_that_do_not_fit_the_old_text_are_cleared() {
    let stale = layout(&["p", "r"], &[("r", 1.0, 1.0)]);
    assert_eq!(
        reconcile(OLD, &format!("{OLD}\n  More"), &stale, &mut counter()),
        ""
    );
    assert_eq!(reconcile(OLD, "Plan", "garbage", &mut counter()), "");
}

#[test]
fn a_block_with_no_layout_stays_without_one() {
    assert_eq!(reconcile(OLD, "Pasted\n  Outline", "", &mut counter()), "");
}

#[test]
fn a_long_outline_keeps_ids_around_an_insert() {
    let lines: Vec<String> = (0..600).map(|i| format!("  line {i}")).collect();
    let ids: Vec<String> = (0..600).map(|i| format!("i{i}")).collect();
    let id_refs: Vec<&str> = ids.iter().map(String::as_str).collect();
    let raw = layout(&id_refs, &[("i300", 9.0, 9.0)]);
    let mut edited = lines.clone();
    edited.insert(100, "  new".into());
    let next = reconcile(&lines.join("\n"), &edited.join("\n"), &raw, &mut counter());
    assert_eq!(ids_of(&next)[101], "i100");
    assert_eq!(
        positions_of(&next),
        json!({ "i300": { "x": 9.0, "y": 9.0 } })
    );
}

#[test]
fn readings_tell_apart_the_kinds_of_stored_value() {
    assert!(matches!(read(""), Stored::None));
    assert!(matches!(read(&layout(&["a"], &[])), Stored::Known(_)));
    assert!(matches!(read("{\"v\":2}"), Stored::Newer));
    for raw in [
        "nope",
        "[]",
        "{\"v\":1}",
        "{\"v\":1,\"ids\":[1],\"positions\":{}}",
        "{\"v\":1,\"ids\":[\"a\"],\"positions\":{\"a\":{\"x\":\"1\",\"y\":2}}}",
    ] {
        assert!(matches!(read(raw), Stored::Broken), "{raw}");
    }
}
