//! The store plugin treats a store file it can't parse as empty and overwrites
//! it on the next save. Before the window loads, keep a copy of any
//! `settings.json` or `preferences.json` that isn't a JSON object, so a damaged
//! file is never the only copy of what was in it. The original is left in place.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;

const STORE_FILES: [&str; 2] = ["settings.json", "preferences.json"];

/// Copies each unreadable store file next to itself as `<name>.corrupt-<hash>`,
/// once per distinct content. Never fails the launch.
pub fn preserve_unreadable_stores(dir: &Path) {
    for name in STORE_FILES {
        let path = dir.join(name);
        let Ok(bytes) = fs::read(&path) else { continue };
        if serde_json::from_slice::<serde_json::Map<String, serde_json::Value>>(&bytes).is_ok() {
            continue;
        }
        let mut hasher = DefaultHasher::new();
        bytes.hash(&mut hasher);
        let copy = dir.join(format!("{name}.corrupt-{:016x}", hasher.finish()));
        if copy.exists() {
            continue;
        }
        if let Err(error) = fs::write(&copy, &bytes) {
            eprintln!("Couldn't keep a copy of unreadable {name}: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("nookly-store-guard-{}", crate::db::new_id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn copies(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".corrupt-"))
            .collect();
        names.sort();
        names
    }

    #[test]
    fn keeps_a_copy_of_a_damaged_file_and_leaves_the_original() {
        let dir = scratch();
        fs::write(dir.join("settings.json"), b"{\"appearance.theme\": \"da").unwrap();
        preserve_unreadable_stores(&dir);
        let found = copies(&dir);
        assert_eq!(found.len(), 1);
        assert!(found[0].starts_with("settings.json.corrupt-"));
        assert_eq!(
            fs::read(dir.join(&found[0])).unwrap(),
            b"{\"appearance.theme\": \"da"
        );
        assert_eq!(
            fs::read(dir.join("settings.json")).unwrap(),
            b"{\"appearance.theme\": \"da"
        );
    }

    #[test]
    fn does_not_copy_again_for_the_same_content() {
        let dir = scratch();
        fs::write(dir.join("preferences.json"), b"not json").unwrap();
        preserve_unreadable_stores(&dir);
        preserve_unreadable_stores(&dir);
        assert_eq!(copies(&dir).len(), 1);
    }

    #[test]
    fn ignores_valid_and_missing_files() {
        let dir = scratch();
        fs::write(dir.join("settings.json"), b"{\"a\": 1}").unwrap();
        preserve_unreadable_stores(&dir);
        assert!(copies(&dir).is_empty());
    }

    #[test]
    fn treats_a_non_object_as_damaged() {
        let dir = scratch();
        fs::write(dir.join("settings.json"), b"[1, 2]").unwrap();
        preserve_unreadable_stores(&dir);
        assert_eq!(copies(&dir).len(), 1);
    }
}
