//! The user's own words for the spell checker, in `dictionary.json` in the app data folder:
//! `{ "words": ["Nookly", "Informatik"] }`. It is a plain file the user can open and edit
//! (Settings has a button for it). Nookly adds to it when a word is added from the right click
//! menu, and never replaces a file it cannot read: it stays exactly as it is until it is fixed.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const FILE: &str = "dictionary.json";

#[derive(Serialize, Deserialize, Default)]
struct Dictionary {
    #[serde(default)]
    words: Vec<String>,
}

pub fn path_in(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

/// The words in the file. No file is no words. A file that is not valid is an error, and is
/// left alone.
pub fn read_words(dir: &Path) -> AppResult<Vec<String>> {
    let path = path_in(dir);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(AppError::Io(e.to_string())),
    };
    let parsed: Dictionary = serde_json::from_slice(&bytes).map_err(|_| {
        AppError::InvalidInput(format!(
            "{FILE} can't be read. Fix it or remove it, then try again. Nookly leaves it as it is."
        ))
    })?;
    Ok(parsed
        .words
        .into_iter()
        .map(|word| word.trim().to_string())
        .filter(|word| !word.is_empty())
        .collect())
}

/// Adds a word, unless it is there already in any case. The file is written to a temporary
/// file first and moved into place, so it is never left half written.
pub fn add_word(dir: &Path, word: &str) -> AppResult<()> {
    let word = word.trim();
    if word.is_empty() {
        return Ok(());
    }
    // Reading first means an unreadable file is an error and is never replaced.
    let mut words = read_words(dir)?;
    if words
        .iter()
        .any(|known| known.to_lowercase() == word.to_lowercase())
    {
        return Ok(());
    }
    words.push(word.to_string());
    std::fs::create_dir_all(dir).map_err(|e| AppError::Io(e.to_string()))?;
    let text = serde_json::to_string_pretty(&Dictionary { words })
        .map_err(|e| AppError::Io(e.to_string()))?;
    let temp = dir.join(format!("{FILE}.tmp"));
    std::fs::write(&temp, format!("{text}\n")).map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::rename(&temp, path_in(dir)).map_err(|e| AppError::Io(e.to_string()))
}

/// Makes sure the file exists, with no words when it is new. An existing file is never opened
/// for writing, so what the user has is never replaced.
pub fn ensure_file(dir: &Path) -> AppResult<PathBuf> {
    std::fs::create_dir_all(dir).map_err(|e| AppError::Io(e.to_string()))?;
    let path = path_in(dir);
    match OpenOptions::new().write(true).create_new(true).open(&path) {
        Ok(mut file) => file
            .write_all(b"{\n  \"words\": []\n}\n")
            .map_err(|e| AppError::Io(e.to_string()))?,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(e) => return Err(AppError::Io(e.to_string())),
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("nookly-dictionary-{}", crate::db::new_id()))
    }

    #[test]
    fn no_file_is_no_words() {
        assert!(read_words(&temp_dir()).unwrap().is_empty());
    }

    #[test]
    fn a_word_added_is_kept_in_the_file_and_read_back() {
        let dir = temp_dir();
        add_word(&dir, "Nookly").unwrap();
        add_word(&dir, "  Informatik ").unwrap();
        assert_eq!(read_words(&dir).unwrap(), vec!["Nookly", "Informatik"]);
        let text = std::fs::read_to_string(path_in(&dir)).unwrap();
        assert!(text.contains("\"words\""), "{text}");
        assert!(!dir.join("dictionary.json.tmp").exists());
    }

    #[test]
    fn a_word_is_added_once_in_any_case_and_blank_adds_nothing() {
        let dir = temp_dir();
        add_word(&dir, "Nookly").unwrap();
        add_word(&dir, "nookly").unwrap();
        add_word(&dir, "NOOKLY").unwrap();
        add_word(&dir, "   ").unwrap();
        assert_eq!(read_words(&dir).unwrap(), vec!["Nookly"]);
    }

    #[test]
    fn what_the_user_edited_is_kept_when_a_word_is_added() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            path_in(&dir),
            "{ \"words\": [\"Eigenwort\", \"  \", \"Zwei\"] }",
        )
        .unwrap();
        add_word(&dir, "Neu").unwrap();
        assert_eq!(read_words(&dir).unwrap(), vec!["Eigenwort", "Zwei", "Neu"]);
    }

    #[test]
    fn a_file_that_cannot_be_read_is_an_error_and_is_never_replaced() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let broken = "{ \"words\": [\"half\", ";
        std::fs::write(path_in(&dir), broken).unwrap();
        let err = read_words(&dir).unwrap_err().to_string();
        assert!(err.contains("dictionary.json can't be read"), "{err}");
        assert!(add_word(&dir, "Neu").is_err());
        assert_eq!(std::fs::read_to_string(path_in(&dir)).unwrap(), broken);
    }

    #[test]
    fn a_file_with_other_keys_or_no_words_reads_as_no_words() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(path_in(&dir), "{}").unwrap();
        assert!(read_words(&dir).unwrap().is_empty());
    }

    #[test]
    fn the_file_is_created_once_and_an_existing_one_is_left_untouched() {
        let dir = temp_dir();
        let path = ensure_file(&dir).unwrap();
        assert_eq!(read_words(&dir).unwrap(), Vec::<String>::new());
        let content = "{ \"words\": [\"Mein\"] }";
        std::fs::write(&path, content).unwrap();
        ensure_file(&dir).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), content);
    }
}
