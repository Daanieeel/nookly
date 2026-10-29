//! The spell checker for the page editor. All of it reads and answers: nothing is written to
//! the database. The user's own words live in the settings, and come with every `configure`.

use crate::error::{AppError, AppResult};
use crate::spelling::SpellState;
use tauri::State;

fn locked<T>(
    state: &State<SpellState>,
    f: impl FnOnce(&mut crate::spelling::Speller) -> T,
) -> AppResult<T> {
    let mut speller = state
        .0
        .lock()
        .map_err(|_| AppError::Io("the spell checker stopped working".into()))?;
    Ok(f(&mut speller))
}

/// Switches on these languages, with the user's own words. Returns the ones that are on.
#[tauri::command]
pub async fn spell_configure(
    state: State<'_, SpellState>,
    languages: Vec<String>,
    personal: Vec<String>,
) -> AppResult<Vec<String>> {
    locked(&state, |speller| speller.configure(&languages, &personal))
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
