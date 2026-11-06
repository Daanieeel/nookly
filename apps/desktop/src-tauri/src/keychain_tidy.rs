//! Keeps the macOS keychain list of apps that may read a saved login short.
//!
//! macOS adds an entry to a keychain item every time someone clicks "Always Allow" for a
//! new build of an app. Builds signed with the same certificate share one entry, but the
//! entries from older builds stay behind forever. `read` rewrites an item once, after a
//! successful read, so the new item trusts only the running app.
//!
//! Nothing is lost on the way: the secret is copied to a second item first, checked, and
//! only then is the original replaced. If the app stops half way, the next read finds the
//! copy and puts it back.

use std::path::{Path, PathBuf};

/// Suffix of the temporary copy kept while an item is rewritten.
const BACKUP_SUFFIX: &str = ".tidy-backup";
const MARKS_FILE: &str = "keychain-tidied";

pub trait Secrets {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, String>;
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<(), String>;
    fn delete(&self, service: &str, account: &str) -> Result<(), String>;
}

/// Which items were already rewritten, so it never happens twice.
pub trait Marks {
    fn is_done(&self, service: &str, account: &str) -> bool;
    fn mark(&self, service: &str, account: &str);
}

fn backup_of(account: &str) -> String {
    format!("{account}{BACKUP_SUFFIX}")
}

/// Reads a saved secret and, the first time, rewrites its keychain item. A failure while
/// rewriting never fails the read: the secret is returned either way.
pub fn read(
    store: &dyn Secrets,
    marks: &dyn Marks,
    service: &str,
    account: &str,
) -> Result<Option<String>, String> {
    let backup = backup_of(account);
    let Some(secret) = store.get(service, account)? else {
        // Stopped half way last time: the copy still has the secret, put it back.
        let Some(secret) = store.get(service, &backup)? else {
            return Ok(None);
        };
        store.set(service, account, &secret)?;
        let _ = store.delete(service, &backup);
        marks.mark(service, account);
        return Ok(Some(secret));
    };
    if !marks.is_done(service, account) {
        rewrite(store, marks, service, account, &secret);
    }
    Ok(Some(secret))
}

fn rewrite(store: &dyn Secrets, marks: &dyn Marks, service: &str, account: &str, secret: &str) {
    let backup = backup_of(account);
    // The copy has to exist and read back right before the original is touched.
    let copied = store.set(service, &backup, secret).is_ok()
        && store.get(service, &backup).ok().flatten().as_deref() == Some(secret);
    if !copied {
        let _ = store.delete(service, &backup);
        return;
    }
    if store.delete(service, account).is_err() {
        // Not allowed to replace it without asking: leave it and do not ask again.
        let _ = store.delete(service, &backup);
        marks.mark(service, account);
        return;
    }
    let written = store.set(service, account, secret).is_ok()
        && store.get(service, account).ok().flatten().as_deref() == Some(secret);
    if !written {
        // The copy stays; the next read puts it back.
        eprintln!("Nookly: could not rewrite a keychain item, it is restored on the next start");
        return;
    }
    let _ = store.delete(service, &backup);
    marks.mark(service, account);
}

/// Drops the temporary copy, for when the secret is replaced or removed.
pub fn forget_backup(store: &dyn Secrets, service: &str, account: &str) {
    let _ = store.delete(service, &backup_of(account));
}

/// The system keychain, through the same crate the rest of the app uses.
pub struct SystemKeychain;

impl Secrets for SystemKeychain {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, String> {
        match keyring::Entry::new(service, account)
            .map_err(|e| e.to_string())?
            .get_password()
        {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    fn set(&self, service: &str, account: &str, secret: &str) -> Result<(), String> {
        keyring::Entry::new(service, account)
            .map_err(|e| e.to_string())?
            .set_password(secret)
            .map_err(|e| e.to_string())
    }
    fn delete(&self, service: &str, account: &str) -> Result<(), String> {
        match keyring::Entry::new(service, account)
            .map_err(|e| e.to_string())?
            .delete_credential()
        {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

/// Reads a saved secret from the system keychain. On macOS the item is also rewritten the
/// first time, which drops the entries of old builds; elsewhere there is nothing to tidy.
pub fn get_secret(service: &str, account: &str) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    if let Some(marks) = FileMarks::in_app_data() {
        return read(&SystemKeychain, &marks, service, account);
    }
    SystemKeychain.get(service, account)
}

/// Removes the temporary copy of a secret that is replaced or deleted.
pub fn forget_secret_backup(service: &str, account: &str) {
    forget_backup(&SystemKeychain, service, account);
}

/// Marks kept in a file of the app data folder, one `service/account` per line.
pub struct FileMarks(pub PathBuf);

impl FileMarks {
    pub fn in_app_data() -> Option<Self> {
        let dir = crate::db::standalone_app_data_dir().ok()?;
        Some(Self(dir.join(MARKS_FILE)))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Marks for FileMarks {
    fn is_done(&self, service: &str, account: &str) -> bool {
        let line = format!("{service}/{account}");
        std::fs::read_to_string(self.path()).is_ok_and(|s| s.lines().any(|l| l == line))
    }
    fn mark(&self, service: &str, account: &str) {
        use std::io::Write;
        let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.path())
        else {
            return;
        };
        let _ = writeln!(file, "{service}/{account}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::{HashMap, HashSet};

    #[derive(Default)]
    struct Fake {
        items: RefCell<HashMap<(String, String), String>>,
        /// `(account, nth call)` of `set` that fails, to stop the rewrite half way.
        fail_set: RefCell<Vec<String>>,
        fail_delete: RefCell<Vec<String>>,
        /// Reads of this account give back something else, as a broken keychain would.
        corrupt_reads: RefCell<Vec<String>>,
        deletes: RefCell<Vec<String>>,
    }

    impl Fake {
        fn with(account: &str, secret: &str) -> Self {
            let f = Self::default();
            f.items
                .borrow_mut()
                .insert(("svc".into(), account.into()), secret.into());
            f
        }
        fn has(&self, account: &str) -> Option<String> {
            self.items
                .borrow()
                .get(&("svc".to_string(), account.to_string()))
                .cloned()
        }
    }

    impl Secrets for Fake {
        fn get(&self, service: &str, account: &str) -> Result<Option<String>, String> {
            let found = self
                .items
                .borrow()
                .get(&(service.to_string(), account.to_string()))
                .cloned();
            if self.corrupt_reads.borrow().iter().any(|a| a == account) {
                return Ok(found.map(|_| "garbled".to_string()));
            }
            Ok(found)
        }
        fn set(&self, service: &str, account: &str, secret: &str) -> Result<(), String> {
            let mut fails = self.fail_set.borrow_mut();
            if let Some(i) = fails.iter().position(|a| a == account) {
                fails.remove(i);
                return Err("set failed".into());
            }
            self.items.borrow_mut().insert(
                (service.to_string(), account.to_string()),
                secret.to_string(),
            );
            Ok(())
        }
        fn delete(&self, service: &str, account: &str) -> Result<(), String> {
            self.deletes.borrow_mut().push(account.to_string());
            if self.fail_delete.borrow().iter().any(|a| a == account) {
                return Err("delete failed".into());
            }
            self.items
                .borrow_mut()
                .remove(&(service.to_string(), account.to_string()));
            Ok(())
        }
    }

    #[derive(Default)]
    struct Memory(RefCell<HashSet<String>>);

    impl Marks for Memory {
        fn is_done(&self, service: &str, account: &str) -> bool {
            self.0.borrow().contains(&format!("{service}/{account}"))
        }
        fn mark(&self, service: &str, account: &str) {
            self.0.borrow_mut().insert(format!("{service}/{account}"));
        }
    }

    const BACKUP: &str = "icloud.tidy-backup";

    #[test]
    fn rewrites_the_item_once_and_leaves_no_copy() {
        let store = Fake::with("icloud", "pw");
        let marks = Memory::default();
        assert_eq!(
            read(&store, &marks, "svc", "icloud").unwrap(),
            Some("pw".into())
        );
        assert_eq!(store.has("icloud"), Some("pw".into()));
        assert_eq!(store.has(BACKUP), None);
        assert!(marks.is_done("svc", "icloud"));
        // The original was deleted and written again: that is what drops the old entries.
        assert_eq!(*store.deletes.borrow(), vec!["icloud", BACKUP]);
    }

    #[test]
    fn a_second_read_touches_nothing() {
        let store = Fake::with("icloud", "pw");
        let marks = Memory::default();
        read(&store, &marks, "svc", "icloud").unwrap();
        store.deletes.borrow_mut().clear();
        assert_eq!(
            read(&store, &marks, "svc", "icloud").unwrap(),
            Some("pw".into())
        );
        assert!(store.deletes.borrow().is_empty());
    }

    #[test]
    fn nothing_saved_reads_as_nothing() {
        let store = Fake::default();
        let marks = Memory::default();
        assert_eq!(read(&store, &marks, "svc", "icloud").unwrap(), None);
        assert!(!marks.is_done("svc", "icloud"));
    }

    #[test]
    fn a_copy_that_cannot_be_written_leaves_the_original_alone() {
        let store = Fake::with("icloud", "pw");
        store.fail_set.borrow_mut().push(BACKUP.into());
        let marks = Memory::default();
        assert_eq!(
            read(&store, &marks, "svc", "icloud").unwrap(),
            Some("pw".into())
        );
        assert_eq!(store.has("icloud"), Some("pw".into()));
        assert!(!store.deletes.borrow().contains(&"icloud".to_string()));
        assert!(!marks.is_done("svc", "icloud"), "tries again next time");
    }

    #[test]
    fn a_copy_that_reads_back_wrong_leaves_the_original_alone() {
        let store = Fake::with("icloud", "pw");
        store.corrupt_reads.borrow_mut().push(BACKUP.into());
        let marks = Memory::default();
        assert_eq!(
            read(&store, &marks, "svc", "icloud").unwrap(),
            Some("pw".into())
        );
        assert_eq!(store.has("icloud"), Some("pw".into()));
        assert_eq!(store.has(BACKUP), None, "the bad copy is removed");
        assert!(!store.deletes.borrow().contains(&"icloud".to_string()));
    }

    #[test]
    fn an_original_that_cannot_be_deleted_is_kept_and_not_retried() {
        let store = Fake::with("icloud", "pw");
        store.fail_delete.borrow_mut().push("icloud".into());
        let marks = Memory::default();
        assert_eq!(
            read(&store, &marks, "svc", "icloud").unwrap(),
            Some("pw".into())
        );
        assert_eq!(store.has("icloud"), Some("pw".into()));
        assert_eq!(store.has(BACKUP), None);
        assert!(marks.is_done("svc", "icloud"), "no prompt on every launch");
    }

    #[test]
    fn stopping_after_the_delete_loses_nothing() {
        let store = Fake::with("icloud", "pw");
        let marks = Memory::default();
        // First `set` is the copy, which must work; the second is the original.
        struct FailSecond<'a>(&'a Fake, RefCell<u32>);
        impl Secrets for FailSecond<'_> {
            fn get(&self, s: &str, a: &str) -> Result<Option<String>, String> {
                self.0.get(s, a)
            }
            fn set(&self, s: &str, a: &str, v: &str) -> Result<(), String> {
                *self.1.borrow_mut() += 1;
                if *self.1.borrow() >= 2 {
                    return Err("closed".into());
                }
                self.0.set(s, a, v)
            }
            fn delete(&self, s: &str, a: &str) -> Result<(), String> {
                self.0.delete(s, a)
            }
        }
        let broken = FailSecond(&store, RefCell::new(0));
        assert_eq!(
            read(&broken, &marks, "svc", "icloud").unwrap(),
            Some("pw".into())
        );
        assert_eq!(store.has("icloud"), None, "the original is gone");
        assert_eq!(store.has(BACKUP), Some("pw".into()), "the copy kept it");

        // Next launch: the copy is put back.
        assert_eq!(
            read(&store, &marks, "svc", "icloud").unwrap(),
            Some("pw".into())
        );
        assert_eq!(store.has("icloud"), Some("pw".into()));
        assert_eq!(store.has(BACKUP), None);
    }

    #[test]
    fn forgetting_removes_the_copy() {
        let store = Fake::with(BACKUP, "pw");
        forget_backup(&store, "svc", "icloud");
        assert_eq!(store.has(BACKUP), None);
    }

    #[test]
    fn marks_survive_in_a_file() {
        let dir = std::env::temp_dir().join(format!("nookly-marks-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let marks = FileMarks(dir.join("keychain-tidied"));
        assert!(!marks.is_done("svc", "icloud"));
        marks.mark("svc", "icloud");
        marks.mark("svc", "google");
        let again = FileMarks(dir.join("keychain-tidied"));
        assert!(again.is_done("svc", "icloud"));
        assert!(again.is_done("svc", "google"));
        assert!(!again.is_done("svc", "moodle"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Needs a real macOS keychain, so it only runs on request:
    /// `cargo test --lib real_keychain -- --ignored --nocapture`.
    /// An item that lists three other apps, as older builds leave behind, ends up listing
    /// only the running app, with the secret unchanged.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "uses the real login keychain"]
    fn real_keychain_drops_stale_apps_and_keeps_the_secret() {
        use std::process::Command;
        let service = format!("nookly-tidy-test-{}", std::process::id());
        let me = std::env::current_exe().unwrap();
        let added = Command::new("security")
            .args([
                "add-generic-password",
                "-s",
                &service,
                "-a",
                "acct",
                "-w",
                "s3cret",
            ])
            .args([
                "-T",
                me.to_str().unwrap(),
                "-T",
                "/bin/ls",
                "-T",
                "/bin/cat",
                "-T",
                "/usr/bin/true",
            ])
            .status()
            .unwrap();
        assert!(added.success());

        let acl = |label: &str| -> String {
            let dump = Command::new("security")
                .args(["dump-keychain", "-a"])
                .output()
                .unwrap();
            let text = String::from_utf8_lossy(&dump.stdout).to_string();
            let item = text
                .split("keychain: ")
                .find(|chunk| chunk.contains(&format!("\"svce\"<blob>=\"{service}\"")))
                .unwrap_or("")
                .to_string();
            let apps: Vec<&str> = item
                .lines()
                .filter(|l| {
                    l.trim_start()
                        .chars()
                        .next()
                        .is_some_and(|c| c.is_ascii_digit())
                        && l.contains(": /")
                })
                .collect();
            eprintln!("{label}: {} apps\n{}", apps.len(), apps.join("\n"));
            item
        };
        let before = acl("before");

        let dir = std::env::temp_dir().join(format!("nookly-real-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let marks = FileMarks(dir.join("keychain-tidied"));
        let got = read(&SystemKeychain, &marks, &service, "acct").unwrap();
        let after = acl("after");

        let kept = SystemKeychain.get(&service, "acct").unwrap();
        let backup = SystemKeychain.get(&service, "acct.tidy-backup").unwrap();
        let _ = SystemKeychain.delete(&service, "acct");
        let _ = SystemKeychain.delete(&service, "acct.tidy-backup");
        let marked = marks.is_done(&service, "acct");
        std::fs::remove_dir_all(&dir).unwrap();

        assert_eq!(got, Some("s3cret".into()));
        assert_eq!(kept, Some("s3cret".into()));
        assert_eq!(backup, None);
        assert!(before.contains("/bin/ls"), "the seeded apps were listed");
        assert!(!after.contains("/bin/ls"), "and are gone");
        assert!(marked);
    }
}
