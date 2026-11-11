use super::*;

fn block(block_type: &str, content: &str, attrs: &[(&str, &str)]) -> Block {
    Block {
        id: "b".into(),
        entity_id: "e".into(),
        position: 0,
        block_type: block_type.into(),
        content: content.into(),
        language: None,
        filename: None,
        attrs: attrs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect(),
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn body(markdown: &str) -> Vec<String> {
    markdown
        .lines()
        .filter(|l| l.starts_with("| ") && l.trim_end_matches(['|', ' ']).len() > 1)
        .map(|l| l[2..l.len() - 1].trim_end().to_string())
        .collect()
}

#[test]
fn timeline_matches_mdxcn_example() {
    let md = timeline_to_markdown(&block(
        "timeline",
        "Mar 12\tCLI copies the files\nMar 18\tDocs, live previews\tnow\nApr 02\tRegistry listed\tnext",
        &[("title", "Shipped")],
    ));
    assert_eq!(
        md,
        "```\n\
+------------------ [ SHIPPED ] -------------------+\n\
|                                                  |\n\
| ●  Mar 12  CLI copies the files                  |\n\
| │                                                |\n\
| ●  Mar 18  Docs, live previews                   |\n\
| │                                                |\n\
| ○  Apr 02  Registry listed                       |\n\
|                                                  |\n\
+--------------------------------------------------+\n\
```"
    );
}

#[test]
fn callout_strips_inline_markup_but_keeps_links() {
    let md = callout_to_markdown(&block(
        "callout",
        "Read **this** and [Lecture](mention:abc) or [docs](https://x.dev)",
        &[("variant", "warning")],
    ));
    assert!(md.contains("[ WARNING ]"));
    assert_eq!(
        body(&md),
        vec!["!  Read this and Lecture or docs (https://x.dev)"]
    );
}

#[test]
fn an_ai_callout_has_its_own_glyph_and_label() {
    let md = callout_to_markdown(&block("callout", "Merged two lines", &[("variant", "ai")]));
    assert!(md.contains("[ AI ]"));
    assert_eq!(body(&md), vec!["*  Merged two lines"]);
}

#[test]
fn progress_draws_a_track_with_the_goal_marked() {
    let md = progress_to_markdown(&block(
        "progress",
        "Chapters\t7\t12\nExercises\t1500\t1000",
        &[],
    ));
    assert_eq!(
        body(&md),
        vec![
            "Chapters   [============-------|]         7 / 12",
            "Exercises  [=============|======]  1,500 / 1,000",
        ]
    );
}

#[test]
fn tree_draws_branches_under_a_single_root() {
    let md = tree_to_markdown(&block("tree", "src\n  db\n    notes.rs\n  main.rs", &[]));
    assert_eq!(
        body(&md),
        vec!["src", "├─ db", "│  └─ notes.rs", "└─ main.rs"]
    );
}

#[test]
fn steps_number_each_step_with_its_detail_below() {
    let md = steps_to_markdown(&block("steps", "Register\tBefore Oct 1\nPay the fee", &[]));
    assert!(md.contains("[ STEPS ]"));
    assert_eq!(
        body(&md),
        vec!["1  Register", "   Before Oct 1", "│", "2  Pay the fee"]
    );
}

#[test]
fn stats_matches_mdxcn_example() {
    let md = stats_to_markdown(&block(
        "stats",
        "12,400\tdocs\n4,100\tcopies\n860\tshipped",
        &[("title", "This week")],
    ));
    assert!(md.contains("+----------------- [ THIS WEEK ] ------------------+"));
    assert_eq!(
        body(&md),
        vec!["12,400   4,100    860", "docs     copies   shipped"]
    );
}

#[test]
fn checklist_exports_as_a_task_list() {
    let md = checklist_to_markdown(&block("checklist", "[x] Buy **notebook**\n[ ] Print", &[]));
    assert_eq!(md, "- [x] Buy **notebook**\n- [ ] Print");
}

#[test]
fn toggle_exports_as_details() {
    let md = toggle_to_markdown(&block("toggle", "Question\nFirst\nSecond", &[]));
    assert_eq!(
        md,
        "<details>\n<summary>Question</summary>\n\nFirst\n\nSecond\n\n</details>"
    );
    let open = toggle_to_markdown(&block("toggle", "Q", &[("toggle", "open")]));
    assert_eq!(open, "<details open>\n<summary>Q</summary>\n\n</details>");
}

#[test]
fn circuit_exports_its_code_and_keeps_a_hand_drawing() {
    let md = (lookup("circuit").unwrap().to_markdown)(&block("circuit", "Y = A & B\n", &[]));
    assert_eq!(md, "```circuit\nY = A & B\n```");
    let attr = |key: &str, value: &str| BlockAttrs::from([(key.to_string(), value.to_string())]);
    assert!(validate_attrs("circuit", &attr("view", "interactive")).is_ok());
    assert!(validate_attrs("circuit", &attr("view", "rendered")).is_ok());
    assert!(validate_attrs("circuit", &attr("view", "paper")).is_err());
    assert!(validate_attrs("circuit", &attr("drawing", "{\"v\":1,\"parts\":[]}")).is_ok());
    // Only a circuit has a third view and a drawing.
    assert!(validate_attrs("equation", &attr("view", "interactive")).is_err());
    assert!(validate_attrs("diagram", &attr("drawing", "{}")).is_err());
    assert!(validate_content("circuit", "anything the editor shows an error for").is_ok());
}

#[test]
fn plot_exports_its_code_and_has_a_preview() {
    let md = (lookup("plot").unwrap().to_markdown)(&block("plot", "f(x) = x^2\n", &[]));
    assert_eq!(md, "```plot\nf(x) = x^2\n```");
    let attr = |key: &str, value: &str| BlockAttrs::from([(key.to_string(), value.to_string())]);
    assert!(validate_attrs("plot", &attr("view", "rendered")).is_ok());
    assert!(validate_attrs("plot", &attr("view", "interactive")).is_err());
    assert!(validate_content("plot", "anything the editor shows an error for").is_ok());
}

#[test]
fn mindmap_exports_its_outline_and_has_a_preview() {
    let outline = "Plan\n  Read\n    Chapter 1\n  Write\n";
    let md = (lookup("mindmap").unwrap().to_markdown)(&block("mindmap", outline, &[]));
    assert_eq!(md, "```mindmap\nPlan\n  Read\n    Chapter 1\n  Write\n```");
    let attr = |key: &str, value: &str| BlockAttrs::from([(key.to_string(), value.to_string())]);
    assert!(validate_attrs("mindmap", &attr("view", "rendered")).is_ok());
    assert!(validate_attrs("mindmap", &attr("view", "interactive")).is_err());
    assert!(validate_attrs("mindmap", &attr("drawing", "{}")).is_err());
    // Any text is an outline, so nothing is turned away.
    assert!(validate_content("mindmap", "- anything\n\tat all").is_ok());
}

#[test]
fn math_exports_as_display_math() {
    let equation = (lookup("equation").unwrap().to_markdown)(&block("equation", "E = mc^2", &[]));
    assert_eq!(equation, "$$\nE = mc^2\n$$");
    let math = (lookup("math").unwrap().to_markdown)(&block("math", "a &= b \\\\\n  &= c", &[]));
    assert_eq!(
        math,
        "$$\n\\begin{aligned}\na &= b \\\\\n&= c\n\\end{aligned}\n$$"
    );
    let own = math_block_latex("\\begin{cases} x \\end{cases}");
    assert_eq!(own, "\\begin{cases} x \\end{cases}");
}

#[test]
fn media_blocks_link_their_target() {
    let image = block(
        "image",
        "[photo.png](mention:f-1)",
        &[("caption", "Campus")],
    );
    assert_eq!(
        (lookup("image").unwrap().to_markdown)(&image),
        "![Campus](mention:f-1)"
    );
    let video = block("video", "https://x.dev/talk.mp4", &[]);
    assert_eq!(
        (lookup("video").unwrap().to_markdown)(&video),
        "[talk.mp4](https://x.dev/talk.mp4)"
    );
    assert!(validate_content("file", "notes.pdf").is_err());
    assert!(validate_content("audio", "[a.mp3](mention:f-2)").is_ok());
    assert!(validate_content("image", "photo.png").is_err());
    assert!(validate_content("image", "https://x.dev/a.png").is_ok());
}

#[test]
fn a_media_block_takes_the_full_path_of_a_file() {
    for block_type in ["file", "image", "video", "audio"] {
        assert!(validate_content(block_type, "/Users/daniel/Downloads/Handout_Woche3.pdf").is_ok());
        assert!(validate_content(block_type, "C:\\Users\\me\\a.pdf").is_ok());
    }
    // Not a full path, a link or a mention.
    for bad in [
        "Handout.pdf",
        "./Handout.pdf",
        "~/Handout.pdf",
        "file:///a.pdf",
        "ftp://x/a",
    ] {
        let err = validate_content("file", bad).unwrap_err();
        assert!(err.to_string().contains("full path"), "{bad}: {err}");
    }
    let file = block("file", "/Users/me/Uni/Handout 3.pdf", &[]);
    assert_eq!(
        (lookup("file").unwrap().to_markdown)(&file),
        "[Handout 3.pdf](file:///Users/me/Uni/Handout%203.pdf)"
    );
    let windows = block("file", "C:\\Uni\\a.pdf", &[]);
    assert_eq!(
        (lookup("file").unwrap().to_markdown)(&windows),
        "[a.pdf](file:///C:/Uni/a.pdf)"
    );
}

#[test]
fn a_file_block_can_open_on_a_page() {
    let on_page = block("file", "[a.pdf](mention:f-1)", &[("page", "12")]);
    let to_markdown = lookup("file").unwrap().to_markdown;
    assert_eq!(to_markdown(&on_page), "[a.pdf](mention:f-1#p12)");
    let plain = block("file", "[a.pdf](mention:f-1)", &[]);
    assert_eq!(to_markdown(&plain), "[a.pdf](mention:f-1)");
    // A page that is not a number is ignored, and a URL has none.
    let odd = block("file", "[a.pdf](mention:f-1)", &[("page", "x")]);
    assert_eq!(to_markdown(&odd), "[a.pdf](mention:f-1)");
    let url = block("file", "https://x.dev/a.pdf", &[("page", "3")]);
    assert_eq!(to_markdown(&url), "[a.pdf](https://x.dev/a.pdf)");
    let page = |n: &str| BlockAttrs::from([("page".to_string(), n.to_string())]);
    assert!(validate_attrs("file", &page("12")).is_ok());
    assert!(validate_attrs("file", &page("0")).is_err());
    assert!(validate_attrs("image", &page("2")).is_err());
}

// #169: a file block can name the last page of the part it is about. It is only a note
// for the reader; the file still opens on `page`, and the link keeps that page alone.
#[test]
fn a_file_block_can_name_the_last_page_of_an_interval() {
    let interval = block(
        "file",
        "[a.pdf](mention:f-1)",
        &[("page", "3"), ("pageTo", "9")],
    );
    assert_eq!(
        (lookup("file").unwrap().to_markdown)(&interval),
        "[a.pdf](mention:f-1#p3)"
    );
    let to = |n: &str| BlockAttrs::from([("pageTo".to_string(), n.to_string())]);
    assert!(validate_attrs("file", &to("9")).is_ok());
    assert!(validate_attrs("file", &to("")).is_ok());
    assert!(validate_attrs("file", &to("0")).is_err());
    assert!(validate_attrs("file", &to("x")).is_err());
    assert!(validate_attrs("image", &to("9")).is_err());
}

#[test]
fn details_align_labels() {
    let md = details_to_markdown(&block(
        "details",
        "Family\tGeist Mono\nTracking\t+0.02em",
        &[],
    ));
    assert_eq!(body(&md), vec!["Family    Geist Mono", "Tracking  +0.02em"]);
}

#[test]
fn content_and_attrs_are_validated() {
    assert!(validate_content("stats", "1\ta\n2\tb\n3\tc\n4\td\n5\te").is_err());
    assert!(validate_content("details", "a\tb\tc").is_err());
    assert!(validate_content("divider", "").is_ok());
    assert!(validate_content("embed", "https://youtu.be/x").is_ok());
    assert!(validate_content("embed", "youtu.be/x").is_err());
    assert!(validate_content("bookmark", "https://x.dev").is_err());
    assert!(validate_content("entity_card", "[Exam](mention:ab-12)").is_ok());
    assert!(validate_content("entity_card", "Exam").is_err());
    assert!(validate_content("checklist", "[ ] a\n[x] b").is_ok());
    assert!(validate_content("checklist", "- [ ] a").is_err());
    assert!(validate_content("divider", "text").is_err());
    let current = |v: &str| BlockAttrs::from([("current".to_string(), v.to_string())]);
    assert!(validate_attrs("steps", &current("2")).is_ok());
    assert!(validate_attrs("steps", &current("0")).is_err());
    assert!(validate_attrs("steps", &current("two")).is_err());

    assert!(validate_content("progress", "Pages\t3\t10").is_ok());
    assert!(validate_content("progress", "Pages\tthree\t10").is_err());
    assert!(validate_content("progress", "Pages\t3\t0").is_err());
    assert!(validate_content("timeline", "Mon\tStart\tlater").is_err());
    assert!(validate_content("paragraph", "anything").is_ok());

    let attrs = |k: &str, v: &str| BlockAttrs::from([(k.to_string(), v.to_string())]);
    assert!(validate_attrs("callout", &attrs("variant", "tip")).is_ok());
    assert!(validate_attrs("callout", &attrs("variant", "ai")).is_ok());
    assert!(validate_attrs("callout", &attrs("variant", "loud")).is_err());
    assert!(validate_attrs("callout", &attrs("title", "x")).is_err());
    assert!(validate_attrs("paragraph", &attrs("title", "x")).is_err());
    assert!(validate_attrs("heading2", &attrs("toggle", "closed")).is_ok());
    assert!(validate_attrs("heading2", &attrs("toggle", "yes")).is_err());
    assert!(validate_attrs("numbered_list", &attrs("marker", "a)")).is_ok());
    assert!(validate_attrs("numbered_list", &attrs("marker", "A.")).is_ok());
    assert!(validate_attrs("numbered_list", &attrs("marker", "b.")).is_err());
    assert!(validate_attrs("bulleted_list", &attrs("marker", "a.")).is_err());
}

#[test]
fn a_lettered_list_exports_with_its_letters() {
    let md = crate::db::notes::block_to_markdown(&block(
        "numbered_list",
        "One\nTwo",
        &[("marker", "a)")],
    ));
    assert_eq!(md, "a) One\nb) Two");
    let plain = crate::db::notes::block_to_markdown(&block("numbered_list", "One\nTwo", &[]));
    assert_eq!(plain, "1. One\n2. Two");
}

#[test]
fn a_table_takes_a_pinned_column_count() {
    let pinned = |n: &str| BlockAttrs::from([("pinned".to_string(), n.to_string())]);
    assert!(validate_attrs("table", &pinned("2")).is_ok());
    assert!(validate_attrs("table", &pinned("0")).is_err());
    assert!(validate_attrs("table", &pinned("two")).is_err());
    assert!(validate_attrs("paragraph", &pinned("2")).is_err());
    let mut attrs = pinned("2");
    merge_attrs("table", &mut attrs, BlockAttrs::new());
    assert_eq!(attrs.get("pinned").map(String::as_str), Some("2"));
    // The markdown export of a table is the same pinned or not.
    let plain = crate::db::notes::block_to_markdown(&block("table", "A\tB\n1\t2", &[]));
    let on = crate::db::notes::block_to_markdown(&block("table", "A\tB\n1\t2", &[("pinned", "1")]));
    assert_eq!(plain, on);
}

#[test]
fn a_tab_in_front_of_a_list_line_nests_it() {
    let nested = "One\n\tOne a\n\tOne b\n\t\tDeep\nTwo";
    let bullets = crate::db::notes::block_to_markdown(&block("bulleted_list", nested, &[]));
    assert_eq!(
        bullets,
        "- One\n    - One a\n    - One b\n        - Deep\n- Two"
    );
    let numbers = crate::db::notes::block_to_markdown(&block("numbered_list", nested, &[]));
    assert_eq!(
        numbers,
        "1. One\n    1. One a\n    2. One b\n        1. Deep\n2. Two"
    );
    // Counting starts over under each parent, in the letters of the list.
    let lettered = crate::db::notes::block_to_markdown(&block(
        "numbered_list",
        "A\n\tx\nB\n\ty",
        &[("marker", "a.")],
    ));
    assert_eq!(lettered, "a. A\n    a. x\nb. B\n    a. y");
}

#[test]
fn a_nested_line_cannot_skip_a_level() {
    let items = list_items(&BlockAttrs::new(), "One\n\t\t\tToo deep".lines(), Some("-"));
    assert_eq!(items.iter().map(|i| i.depth).collect::<Vec<_>>(), [0, 1]);
    // The first line of a list cannot be nested at all.
    let first = list_items(&BlockAttrs::new(), "\tStart".lines(), Some("-"));
    assert_eq!((first[0].depth, first[0].text), (0, "Start"));
}

#[test]
fn a_numbered_list_can_start_later_in_its_count() {
    let attrs = |pairs: &[(&str, &str)]| {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<BlockAttrs>()
    };
    let md = |attrs: &[(&str, &str)]| {
        crate::db::notes::block_to_markdown(&block("numbered_list", "One\nTwo\nThree", attrs))
    };
    assert_eq!(md(&[("start", "12")]), "12. One\n13. Two\n14. Three");
    assert_eq!(
        md(&[("marker", "a."), ("start", "2")]),
        "b. One\nc. Two\nd. Three"
    );
    assert_eq!(
        md(&[("marker", "A)"), ("start", "3")]),
        "C) One\nD) Two\nE) Three"
    );
    assert_eq!(md(&[("start", "1")]), "1. One\n2. Two\n3. Three");
    // A start that is not a number from one is ignored.
    assert_eq!(md(&[("start", "x")]), "1. One\n2. Two\n3. Three");
    assert!(validate_attrs("numbered_list", &attrs(&[("start", "12")])).is_ok());
    assert!(validate_attrs("numbered_list", &attrs(&[("start", "0")])).is_err());
    assert!(validate_attrs("bulleted_list", &attrs(&[("start", "2")])).is_err());
    assert!(validate_attrs("numbered_list", &attrs(&[("nestedStarts", "1:2")])).is_ok());
}

#[test]
fn a_nested_numbered_list_counts_like_its_list_from_where_it_starts() {
    let attrs = |pairs: &[(&str, &str)]| {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<BlockAttrs>()
    };
    // "Two" was indented under "One": it stays b.
    let indented = crate::db::notes::block_to_markdown(&block(
        "numbered_list",
        "One\n\tTwo\nThree",
        &[("marker", "a."), ("nestedStarts", "1:2")],
    ));
    assert_eq!(indented, "a. One\n    b. Two\nb. Three");
    let numbers = crate::db::notes::block_to_markdown(&block(
        "numbered_list",
        "One\n\tTwo\n\tThree\nFour\n\tFive",
        &[("nestedStarts", "1:2,4:5")],
    ));
    assert_eq!(
        numbers,
        "1. One\n    2. Two\n    3. Three\n2. Four\n    5. Five"
    );
    // Without a recorded start a nested list begins at one, in the style of its list.
    let plain = crate::db::notes::block_to_markdown(&block(
        "numbered_list",
        "One\n\tTwo",
        &[("marker", "A.")],
    ));
    assert_eq!(plain, "A. One\n    A. Two");
    let items = list_items(
        &attrs(&[("marker", "a."), ("start", "3"), ("nestedStarts", "1:2")]),
        "One\n\tTwo\nThree".lines(),
        None,
    );
    assert_eq!(
        items.iter().map(|i| i.marker.as_str()).collect::<Vec<_>>(),
        ["c.", "b.", "d."]
    );
}

#[test]
fn list_markers_follow_the_marker_attr() {
    let attrs = |m: &str| BlockAttrs::from([("marker".to_string(), m.to_string())]);
    assert_eq!(numbered_marker(&BlockAttrs::new(), 0), "1.");
    assert_eq!(numbered_marker(&BlockAttrs::new(), 11), "12.");
    assert_eq!(numbered_marker(&attrs("a."), 1), "b.");
    assert_eq!(numbered_marker(&attrs("a)"), 2), "c)");
    assert_eq!(numbered_marker(&attrs("A."), 0), "A.");
    assert_eq!(numbered_marker(&attrs("A)"), 25), "Z)");
    assert_eq!(numbered_marker(&attrs("a."), 26), "aa.");
    assert_eq!(numbered_marker(&attrs("a."), 27), "ab.");
}

#[test]
fn merge_attrs_clears_empty_values_and_drops_undeclared_keys() {
    let mut attrs = BlockAttrs::from([("title".to_string(), "Plan".to_string())]);
    merge_attrs("callout", &mut attrs, BlockAttrs::new());
    assert!(attrs.is_empty());

    let mut attrs = BlockAttrs::from([("title".to_string(), "Plan".to_string())]);
    merge_attrs(
        "tree",
        &mut attrs,
        BlockAttrs::from([("title".to_string(), String::new())]),
    );
    assert!(attrs.is_empty());
}

#[test]
fn mindmap_keeps_where_nodes_were_dragged_in_a_layout_attr() {
    let attr = |key: &str, value: &str| BlockAttrs::from([(key.to_string(), value.to_string())]);
    assert!(validate_attrs(
        "mindmap",
        &attr("layout", "{\"v\":1,\"ids\":[],\"positions\":{}}")
    )
    .is_ok());
    // Only a mind map has one.
    assert!(validate_attrs("plot", &attr("layout", "{}")).is_err());
    // The layout is not the outline: the markdown has the outline alone.
    let md = (lookup("mindmap").unwrap().to_markdown)(&block(
        "mindmap",
        "Plan\n  Read",
        &[("layout", "{\"v\":1,\"ids\":[\"a\",\"b\"],\"positions\":{}}")],
    ));
    assert_eq!(md, "```mindmap\nPlan\n  Read\n```");
}
