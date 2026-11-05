// Production code must not panic: the release profile aborts the whole app on a panic.
// Use `?` with an `AppError`, or `crate::error::literal_regex` for a regex literal. Tests
// may unwrap freely.
#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used))]

use tauri::Manager;

mod backup;
mod cli;
mod commands;
mod crash_report;
mod data_folder;
mod db;
mod dictionary_file;
mod error;
mod external_calendars;
mod logging;
mod moodle;
mod spelling;
mod store_guard;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// The default menu minus "Close Window": its Cmd+W would close the whole app, and
/// Cmd+W closes the current tab instead. The window still closes with its own button.
fn app_menu<R: tauri::Runtime>(
    handle: &tauri::AppHandle<R>,
) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
    // A menu item belongs to one place, so each divider is its own item.
    let separator = || PredefinedMenuItem::separator(handle);
    let app = Submenu::with_items(
        handle,
        "Nookly",
        true,
        &[
            &PredefinedMenuItem::about(handle, None, None)?,
            &separator()?,
            &PredefinedMenuItem::services(handle, None)?,
            &separator()?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::show_all(handle, None)?,
            &separator()?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &separator()?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;
    let view = Submenu::with_items(
        handle,
        "View",
        true,
        &[&PredefinedMenuItem::fullscreen(handle, None)?],
    )?;
    let window = Submenu::with_items(
        handle,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(handle, None)?,
            &PredefinedMenuItem::maximize(handle, None)?,
        ],
    )?;
    Menu::with_items(handle, &[&app, &edit, &view, &window])
}

/// Every command the interface can call, by name. Adding a command means adding a line here.
fn command_handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        commands::spaces::create_space,
        commands::spaces::list_spaces,
        commands::spaces::update_space,
        commands::spaces::delete_space,
        commands::spaces::reorder_spaces,
        commands::spaces::list_space_modules,
        commands::spaces::add_space_module,
        commands::spaces::remove_space_module,
        commands::spaces::reorder_space_modules,
        commands::entities::create_entity,
        commands::entities::get_entity,
        commands::entities::update_entity,
        commands::entities::list_entities,
        commands::entities::list_entities_by_ids,
        commands::entities::touch_entity_opened,
        commands::entities::soft_delete_entity,
        commands::entities::restore_entity,
        commands::entities::hard_delete_entity,
        commands::entities::empty_trash,
        commands::entities::duplicate_entity,
        commands::relationships::create_relationship,
        commands::relationships::list_relationships,
        commands::relationships::delete_relationship,
        commands::relationships::list_relationship_types,
        commands::search::search,
        commands::labels::create_label,
        commands::labels::list_labels,
        commands::labels::update_label,
        commands::labels::delete_label,
        commands::labels::attach_label,
        commands::labels::detach_label,
        commands::labels::list_labels_for_entity,
        commands::labels::list_entity_label_ids,
        commands::tasks::list_task_statuses,
        commands::tasks::create_task,
        commands::tasks::create_subtask,
        commands::tasks::list_subtasks,
        commands::tasks::subtask_progress,
        commands::tasks::list_tasks,
        commands::tasks::list_tasks_all,
        commands::tasks::get_task,
        commands::tasks::update_task_status,
        commands::tasks::update_task_dates,
        commands::tasks::update_task_effort,
        commands::tasks::set_task_repeat,
        commands::tasks::convert_to_subtask,
        commands::tasks::count_tasks_due_today,
        commands::tasks::count_open_tasks_due_or_overdue,
        commands::tasks::list_open_tasks_due_or_overdue,
        commands::notes::create_note,
        commands::notes::create_jot,
        commands::notes::count_unrefined_jots,
        commands::notes::count_unrefined_jots_all_spaces,
        commands::notes::list_unrefined_jots_all_spaces,
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
        commands::notes::get_note_code_language,
        commands::notes::set_note_code_language,
        commands::notes::export_page_markdown,
        commands::notes::write_page_export,
        commands::portable::render_entity_json,
        commands::portable::export_entity_json,
        commands::portable::preview_entity_json,
        commands::portable::preview_entity_text,
        commands::portable::import_entity_json,
        commands::portable::import_entity_text,
        commands::courses::create_course,
        commands::courses::list_courses,
        commands::courses::create_semester,
        commands::courses::list_semesters,
        commands::courses::get_grade_report,
        commands::courses::update_semester,
        commands::courses::set_current_semester,
        commands::courses::reorder_semesters,
        commands::courses::link_course_to_semester,
        commands::courses::set_course_semester,
        commands::courses::get_course_notes,
        commands::courses::get_semester_notes,
        commands::courses::get_course_grades,
        commands::courses::get_course_details,
        commands::courses::update_course_professor,
        commands::sessions::create_session_template,
        commands::sessions::generate_occurrences,
        commands::sessions::create_one_off_session,
        commands::sessions::override_occurrence,
        commands::sessions::list_sessions,
        commands::sessions::list_sessions_all,
        commands::sessions::list_sessions_today,
        commands::sessions::list_sessions_between,
        commands::sessions::update_session_series,
        commands::sessions::delete_session_series,
        commands::sessions::get_session_pages,
        commands::sessions::create_session_page,
        commands::sessions::link_session_page,
        commands::calendar::create_calendar_entry_template,
        commands::calendar::generate_calendar_entry_occurrences,
        commands::calendar::create_one_off_calendar_entry,
        commands::calendar::override_calendar_entry_occurrence,
        commands::calendar::list_calendar_entries,
        commands::calendar::list_calendar_entries_all,
        commands::calendar::list_calendar_entry_templates,
        commands::calendar::update_calendar_entry_series,
        commands::calendar::delete_calendar_entry_series,
        commands::exams::create_exam,
        commands::exams::list_exams,
        commands::exams::list_exams_all_spaces,
        commands::exams::update_exam,
        commands::exams::update_exam_date,
        commands::exams::update_exam_weight,
        commands::exams::update_exam_grade,
        commands::exams::update_exam_room,
        commands::exams::update_exam_time,
        commands::exams::set_exam_course,
        commands::decks::create_deck,
        commands::decks::list_decks,
        commands::decks::list_deck_summaries,
        commands::decks::list_deck_summaries_all_spaces,
        commands::decks::set_deck_exam,
        commands::decks::deck_stats,
        commands::decks::create_card,
        commands::decks::update_card,
        commands::decks::delete_card,
        commands::decks::restore_card,
        commands::decks::list_cards,
        commands::decks::study_queue,
        commands::decks::review_card,
        commands::decks::undo_review,
        commands::study_blocks::create_study_block,
        commands::study_blocks::list_study_blocks,
        commands::assignments::create_assignment,
        commands::assignments::list_assignments,
        commands::assignments::list_assignments_all_spaces,
        commands::assignments::update_assignment_status,
        commands::assignments::update_assignment_due_date,
        commands::assignments::update_assignment_due_before_session,
        commands::assignments::update_assignment_weight,
        commands::assignments::update_assignment_ungraded,
        commands::assignments::set_assignment_course,
        commands::recipes::create_recipe,
        commands::recipes::list_recipes,
        commands::recipes::get_recipe,
        commands::recipes::update_recipe_kind,
        commands::recipes::update_recipe_duration,
        commands::recipes::list_recipe_tags,
        commands::recipes::update_recipe_tags,
        commands::recipes::set_recipe_banner,
        commands::recipes::list_ingredients,
        commands::recipes::create_ingredient,
        commands::recipes::update_ingredient,
        commands::recipes::delete_ingredient,
        commands::recipes::move_ingredient,
        commands::recipes::list_steps,
        commands::recipes::create_step,
        commands::recipes::update_step,
        commands::recipes::delete_step,
        commands::recipes::move_step,
        commands::views::create_view,
        commands::views::list_views,
        commands::views::get_view,
        commands::views::reorder_views,
        commands::views::reorder_overview_views,
        commands::views::update_view_config,
        commands::files::import_file,
        commands::files::import_file_from_url,
        commands::files::import_file_from_bytes,
        commands::files::download_linked_file,
        commands::files::replace_file,
        commands::files::set_file_added_at,
        commands::files::reference_file,
        commands::files::copy_file_into_storage,
        commands::files::open_file,
        commands::files::reveal_file,
        commands::files::list_open_with_apps,
        commands::files::open_file_with,
        commands::office::office_converter_available,
        commands::office::convert_office_to_pdf,
        commands::office_thumbnail::office_thumbnail,
        commands::office_install::libreoffice_install_options,
        commands::office_install::install_libreoffice,
        commands::entities::convert_entity,
        commands::files::list_files,
        commands::files::reindex_missing_files,
        commands::files::get_file,
        commands::files::export_file,
        commands::bookmarks::create_bookmark,
        commands::bookmarks::list_bookmarks,
        commands::bookmarks::get_bookmark,
        commands::bookmarks::fetch_bookmark_metadata,
        commands::bookmarks::update_bookmark_url,
        commands::bookmarks::set_bookmark_preferred_image,
        commands::bookmark_screenshot::capture_bookmark_screenshot,
        commands::cli_install::cli_install_status,
        commands::cli_install::install_cli,
        commands::external_calendars::external_calendar_status,
        commands::external_calendars::connect_google_calendar,
        commands::external_calendars::cancel_google_calendar_connect,
        commands::external_calendars::connect_icloud_calendar,
        commands::external_calendars::connect_moodle_calendar,
        commands::external_calendars::set_external_calendar_selected,
        commands::external_calendars::disconnect_external_calendar,
        commands::external_calendars::sync_external_calendars,
        commands::external_calendars::list_external_events,
        commands::moodle::moodle_status,
        commands::moodle::moodle_open_login,
        commands::moodle::moodle_finish_login,
        commands::moodle::moodle_disconnect,
        commands::moodle::moodle_courses,
        commands::moodle::moodle_contents,
        commands::moodle::moodle_assignments,
        commands::moodle::moodle_assignment_status,
        commands::moodle::moodle_grades,
        commands::moodle::moodle_forums,
        commands::moodle::moodle_discussions,
        commands::moodle::moodle_posts,
        commands::moodle::moodle_file_text,
        commands::moodle::moodle_open_file,
        commands::moodle::moodle_image,
        commands::moodle::moodle_file_path,
        commands::backup::create_backup,
        commands::backup::list_backups,
        commands::backup::inspect_backup,
        commands::backup::restore_backup,
        commands::agent_files::agent_dir_path,
        commands::agent_files::list_agent_files,
        commands::agent_files::list_agent_folders,
        commands::agent_files::create_agent_folder,
        commands::agent_files::delete_agent_folder,
        commands::agent_files::read_agent_file,
        commands::agent_files::write_agent_file,
        commands::agent_files::delete_agent_file,
        commands::agent_files::reveal_agent_dir,
        commands::spell::spell_configure,
        commands::spell::spell_check,
        commands::spell::spell_suggest,
        commands::spell::spell_ignore,
        commands::spell::spell_reload_words,
        commands::spell::spell_add_word,
        commands::spell::reveal_dictionary_file,
        commands::local_files::check_local_path,
        commands::local_files::open_local_path,
        commands::local_files::reveal_local_path,
        commands::ai_apps::list_ai_apps,
        commands::ai_apps::open_agent_dir_in,
        commands::settings_file::open_settings_file,
        commands::crash_report::latest_crash_report,
        commands::crash_report::dismiss_crash_report,
        commands::logging::log_frontend,
        commands::logging::open_logs_folder,
    ]
}

pub fn run() {
    // Anything that runs without the app (the CLI, the crash log) finds the data folder by
    // the bundle identifier, so it is recorded before either can run.
    let context = tauri::generate_context!();
    db::set_identifier(&context.config().identifier);

    // Capture panics to a crash log before `panic = "abort"` kills the process,
    // so any future startup crash is diagnosable without a debug build.
    install_panic_hook();
    handle_command_line();

    let builder = tauri::Builder::default();
    // A second launch, such as a `nookly://` link clicked while Nookly runs, hands its link to
    // the running window and brings it forward instead of starting another instance. Only in a
    // release build: a development build shares the app's identifier, and would otherwise
    // just focus the installed app. Must be the first plugin.
    #[cfg(all(
        not(debug_assertions),
        any(target_os = "macos", windows, target_os = "linux")
    ))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    }));
    let app = builder
        .menu(app_menu)
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(spelling::SpellState::default())
        .setup(|app| setup_app(app))
        .invoke_handler(command_handler())
        .build(context);
    match app {
        Ok(app) => app.run(|_app, _event| {
            // Tauri sets `icon.png` as the dev dock icon on `Ready`, so ours goes after it.
            #[cfg(all(target_os = "macos", debug_assertions))]
            if let tauri::RunEvent::Ready = _event {
                set_dev_dock_icon();
            }
            // A link that opens Nookly (the Moodle sign in comes back this way) may arrive while
            // the browser has the focus, and the result is shown in the window.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { .. } = _event {
                if let Some(window) = _app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }),
        Err(e) => {
            eprintln!("Nookly could not start: {e}");
            std::process::exit(1);
        }
    }
}

/// `nookly cli ...` (PLAN.md §2: a subcommand of the main binary, not a
/// separate one) runs headlessly from a shell or an agent, before Tauri boots a
/// window. A bare `nookly --help` explains itself and exits; anything else falls
/// through to the normal desktop launch.
fn handle_command_line() {
    let mut argv = std::env::args();
    let _program = argv.next();
    let rest: Vec<String> = argv.collect();

    if rest.first().map(String::as_str) == Some("cli") {
        cli::main(rest[1..].to_vec());
    }

    // Anything else, including zero args, is the normal desktop-app launch path
    // (double-click, Dock, `open -a Nookly`), so it still has to open the GUI. But a
    // bare `nookly` (or `nookly --help`) typed at a shell almost always means someone
    // was reaching for the CLI and didn't know to add `cli`, so don't leave a terminal
    // silently hung with no clue why. `--help`/`-h` additionally skips the GUI entirely;
    // nobody asking for help wants a window.
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
}

/// Runs once when the window system is ready: registers the link scheme, opens the
/// database and loads the stores the commands read from.
fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Before anything opens the data folder, the log file included: rename it so Finder can
    // open it.
    data_folder::tidy_at_startup();
    // First, so the migrations and the restore that follow are written down.
    logging::init(&db::resolve_app_data_dir(app.path().app_data_dir()?));
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        os = std::env::consts::OS,
        arch = std::env::consts::ARCH,
        "Nookly starting"
    );
    // Installed builds register the scheme with the system; this does it for the
    // ones that were not installed.
    #[cfg(any(windows, target_os = "linux"))]
    {
        use tauri_plugin_deep_link::DeepLinkExt;
        let _ = app.deep_link().register_all();
    }
    db::setup(app)?;
    store_guard::preserve_unreadable_stores(&db::resolve_app_data_dir(app.path().app_data_dir()?));
    app.manage(external_calendars::ExternalCalendarState::load(
        &db::resolve_app_data_dir(app.path().app_data_dir()?),
    ));
    app.manage(moodle::service::MoodleState::load(
        &db::resolve_app_data_dir(app.path().app_data_dir()?),
        &moodle::login::configured_scheme(&app.config().plugins.0),
    ));
    #[cfg(target_os = "macos")]
    disable_trackpad_magnification(app);
    Ok(())
}

/// Installs a panic hook that writes the panic to the log, and also appends a record to
/// `crash.log` in the app data directory, before `panic = "abort"`
/// kills the process. The hook fires before the abort, so the message survives the crash
/// for later diagnosis. `crash.log` is capped, oldest records first. The default hook still
/// runs after, so a debug build keeps its output on stderr, with the backtrace.
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        tracing::error!(panic = %info, "Nookly panicked");
        if let Ok(dir) = db::standalone_app_data_dir() {
            let record = crash_report::record(
                chrono::Utc::now(),
                env!("CARGO_PKG_VERSION"),
                &info.to_string(),
            );
            let _ =
                logging::append_capped(&dir.join("crash.log"), &record, logging::CRASH_LOG_LIMIT);
        }
        previous(info);
    }));
}

/// Shows the blue "DEV" icon in the dock during `bun run dev`, which runs the bare binary and
/// would otherwise show `icon.png`, so it can't be mistaken for the installed Nookly. The
/// same picture is the icon of the side by side build (`icons-dev/`).
#[cfg(all(target_os = "macos", debug_assertions))]
fn set_dev_dock_icon() {
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let data = NSData::with_bytes(include_bytes!("../icons-dev/icon.png"));
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) else {
        return;
    };
    // SAFETY: called on the main thread with a valid image.
    unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image)) };
}

/// WKWebView's own pinch-to-zoom (magnifying the whole page) fights with the
/// PDF viewer's own trackpad zoom: both react to the same gesture at once,
/// producing a flashing, stuck-after-a-few-percent zoom (`pdf-viewer.tsx`).
/// The gesture itself still reaches JS as `wheel` events with `ctrlKey` set
/// either way — that's a lower level translation WebKit does regardless of
/// this setting — so disabling it here only removes the competing native
/// zoom, not trackpad pinch support itself.
#[cfg(target_os = "macos")]
fn disable_trackpad_magnification(app: &tauri::App) {
    use objc2_web_kit::WKWebView;
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|webview| {
        // SAFETY: on macOS `inner()` is the window's `WKWebView`, alive for
        // the life of the window.
        let view: &WKWebView = unsafe { &*webview.inner().cast::<WKWebView>() };
        unsafe { view.setAllowsMagnification(false) };
    });
}
