mod cli;
mod commands;
mod db;
mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `nookly cli ...` (PLAN.md §2: a subcommand of the main binary, not a
    // separate one) — handled before Tauri ever boots a window, since this is
    // meant to run headlessly from a shell or an agent.
    let mut argv = std::env::args();
    let _program = argv.next();
    let rest: Vec<String> = argv.collect();

    if rest.first().map(String::as_str) == Some("cli") {
        cli::main(rest[1..].to_vec());
    }

    // Anything else — including zero args — is the normal desktop-app launch
    // path (double-click, Dock, `open -a Nookly`), so it still has to open the
    // GUI. But a bare `nookly` (or `nookly --help`) typed at a shell almost
    // always means someone was reaching for the CLI and didn't know to add
    // `cli` — this is the exact confusion a coding agent hit in practice, so
    // don't leave a terminal silently hung with no clue why. `--help`/`-h`
    // additionally skips the GUI entirely; nobody asking for help wants a
    // window.
    use std::io::IsTerminal;
    if matches!(
        rest.first().map(String::as_str),
        Some("--help") | Some("-h") | Some("help")
    ) {
        println!("Nookly is a desktop app — running the bare binary opens the GUI.");
        println!("For the command-line interface: nookly cli --help");
        std::process::exit(0);
    }
    if std::io::stdout().is_terminal() {
        eprintln!("Launching the Nookly GUI. For the command-line interface instead, run: nookly cli --help");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            db::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::spaces::create_space,
            commands::spaces::list_spaces,
            commands::spaces::update_space,
            commands::spaces::delete_space,
            commands::spaces::list_space_modules,
            commands::spaces::add_space_module,
            commands::entities::create_entity,
            commands::entities::get_entity,
            commands::entities::update_entity,
            commands::entities::list_entities,
            commands::entities::soft_delete_entity,
            commands::entities::restore_entity,
            commands::entities::hard_delete_entity,
            commands::entities::duplicate_entity,
            commands::relationships::create_relationship,
            commands::relationships::list_relationships,
            commands::relationships::delete_relationship,
            commands::relationships::list_relationship_types,
            commands::search::search,
            commands::search::list_embedded_page_ids,
            commands::labels::create_label,
            commands::labels::list_labels,
            commands::labels::delete_label,
            commands::labels::attach_label,
            commands::labels::detach_label,
            commands::labels::list_labels_for_entity,
            commands::tasks::list_task_statuses,
            commands::tasks::create_task,
            commands::tasks::create_subtask,
            commands::tasks::list_subtasks,
            commands::tasks::subtask_progress,
            commands::tasks::list_tasks,
            commands::tasks::update_task_status,
            commands::tasks::update_task_dates,
            commands::tasks::convert_to_subtask,
            commands::tasks::count_tasks_due_today,
            commands::tasks::count_open_tasks_due_or_overdue,
            commands::notes::create_note,
            commands::notes::create_jot,
            commands::notes::count_unrefined_jots,
            commands::notes::count_unrefined_jots_all_spaces,
            commands::notes::list_recent_notes,
            commands::notes::list_note_summaries,
            commands::notes::list_jot_summaries,
            commands::notes::list_blocks,
            commands::notes::list_mentioning_entities,
            commands::notes::create_block,
            commands::notes::update_block,
            commands::notes::delete_block,
            commands::notes::reorder_blocks,
            commands::notes::render_page_markdown,
            commands::notes::export_page_markdown,
            commands::courses::create_course,
            commands::courses::list_courses,
            commands::courses::create_semester,
            commands::courses::list_semesters,
            commands::courses::update_semester,
            commands::courses::set_current_semester,
            commands::courses::reorder_semesters,
            commands::courses::link_course_to_semester,
            commands::courses::set_course_semester,
            commands::courses::get_course_notes,
            commands::courses::get_semester_notes,
            commands::sessions::create_session_template,
            commands::sessions::generate_occurrences,
            commands::sessions::create_one_off_session,
            commands::sessions::override_occurrence,
            commands::sessions::list_sessions,
            commands::sessions::list_sessions_today,
            commands::exams::create_exam,
            commands::exams::list_exams,
            commands::exams::list_exams_all_spaces,
            commands::exams::update_exam,
            commands::decks::create_deck,
            commands::decks::list_decks,
            commands::decks::create_card,
            commands::decks::list_cards,
            commands::decks::list_due_cards,
            commands::decks::review_card,
            commands::study_blocks::create_study_block,
            commands::study_blocks::list_study_blocks,
            commands::assignments::create_assignment,
            commands::assignments::list_assignments,
            commands::assignments::list_assignments_all_spaces,
            commands::assignments::update_assignment_status,
            commands::files::import_file,
            commands::files::create_file_link,
            commands::files::list_files,
            commands::files::get_file,
            commands::files::export_file,
            commands::bookmarks::create_bookmark,
            commands::bookmarks::list_bookmarks,
            commands::bookmarks::get_bookmark,
            commands::bookmarks::fetch_bookmark_metadata,
            commands::cli_install::cli_install_status,
            commands::cli_install::install_cli,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
