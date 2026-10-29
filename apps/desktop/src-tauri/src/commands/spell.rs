//! The spell checker for the page editor. The user's own words live in `dictionary.json` in
//! the app data folder (`dictionary_file.rs`), a file they can edit. Nothing here touches the
//! database.

use crate::dictionary_file;
use crate::error::{AppError, AppResult};
use crate::spelling::{SpellState, Speller};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

fn locked<T>(state: &State<SpellState>, f: impl FnOnce(&mut Speller) -> T) -> AppResult<T> {
    let mut speller = state
        .0
        .lock()
        .map_err(|_| AppError::Io("the spell checker stopped working".into()))?;
    Ok(f(&mut speller))
}

fn dictionary_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(crate::db::resolve_app_data_dir(base))
}

/// The user's words, or none when the file cannot be read: a broken dictionary never turns
/// into underlines or an error in the page, and is left as it is.
fn personal_words(app: &AppHandle) -> Vec<String> {
    dictionary_dir(app)
        .and_then(|dir| dictionary_file::read_words(&dir))
        .unwrap_or_default()
}

/// Switches on these languages, with the words from the dictionary file. Returns the ones
/// that are on.
#[tauri::command]
pub async fn spell_configure(
    app: AppHandle,
    state: State<'_, SpellState>,
    languages: Vec<String>,
) -> AppResult<Vec<String>> {
    let personal = personal_words(&app);
    locked(&state, |speller| speller.configure(&languages, &personal))
}

/// Reads the dictionary file again, for when it was edited. Returns whether the words are
/// not the ones the checker had.
#[tauri::command]
pub async fn spell_reload_words(app: AppHandle, state: State<'_, SpellState>) -> AppResult<bool> {
    let personal = personal_words(&app);
    locked(&state, |speller| speller.set_personal(&personal))
}

/// Whether each word is spelled right, in the same order.
#[tauri::command]
pub async fn spell_check(state: State<'_, SpellState>, words: Vec<String>) -> AppResult<Vec<bool>> {
    locked(&state, |speller| {
        words.iter().map(|w| speller.is_correct(w)).collect()
    })
}

#[tauri::command]
pub async fn spell_suggest(state: State<'_, SpellState>, word: String) -> AppResult<Vec<String>> {
    locked(&state, |speller| speller.suggest(&word))
}

/// Accepts a word until Nookly is closed.
#[tauri::command]
pub async fn spell_ignore(state: State<'_, SpellState>, word: String) -> AppResult<()> {
    locked(&state, |speller| speller.ignore(&word))
}

/// Adds a word to the dictionary file, and to the checker. A file that cannot be read is
/// reported and left as it is.
#[tauri::command]
pub async fn spell_add_word(
    app: AppHandle,
    state: State<'_, SpellState>,
    word: String,
) -> AppResult<()> {
    let dir = dictionary_dir(&app)?;
    dictionary_file::add_word(&dir, &word)?;
    let personal = dictionary_file::read_words(&dir)?;
    locked(&state, |speller| speller.set_personal(&personal)).map(|_| ())
}

/// Opens `dictionary.json` in the default app, creating it first when it does not exist.
#[tauri::command]
pub fn open_dictionary_file(app: AppHandle) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let path = dictionary_file::ensure_file(&dictionary_dir(&app)?)?;
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}
