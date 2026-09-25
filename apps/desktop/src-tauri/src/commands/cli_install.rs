//! Backs the sidebar's "Install CLI" card — a single-button way to put the
//! `nookly` binary (this same running app, symlinked) on the user's PATH so
//! `nookly cli ...` works from a shell, instead of making them read the
//! README and run `ln -s` by hand.
//!
//! Unix only for now (symlinks + PATH conventions are straightforward there).
//! Windows reports `supported: false` — the underlying `nookly cli ...`
//! commands still work if the user puts the binary on PATH themselves.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInstallStatus {
    pub supported: bool,
    pub installed: bool,
    /// Where the `nookly` symlink lives (existing, if `installed`; otherwise
    /// where `install_cli` would place it).
    pub link_dir: Option<String>,
    /// The running app binary the link would point at.
    pub target_path: Option<String>,
    /// Non-empty only when `link_dir` isn't a directory that's reliably on
    /// PATH by default (e.g. `~/.local/bin`) — the exact line to add to a
    /// shell profile.
    pub shell_hint: Option<String>,
}

#[cfg(unix)]
mod unix_impl {
    use super::*;

    fn candidate_dirs() -> Vec<PathBuf> {
        let mut dirs = vec![
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/opt/homebrew/bin"),
        ];
        if let Some(home) = dirs::home_dir() {
            dirs.push(home.join(".local/bin"));
        }
        dirs
    }

    fn current_binary() -> AppResult<PathBuf> {
        std::env::current_exe()
            .map_err(|e| AppError::Db(format!("could not resolve the running app's own path: {e}")))
    }

    /// A directory counts as "reliably on PATH" if it's one of the standard
    /// system/Homebrew bin dirs — `~/.local/bin` isn't a macOS default, so
    /// that's the one case worth telling the user about.
    fn needs_path_hint(dir: &std::path::Path) -> bool {
        dir.ends_with(".local/bin")
    }

    fn shell_hint_for(dir: &std::path::Path) -> Option<String> {
        needs_path_hint(dir).then(|| {
            format!(
                "Add this to your shell profile (~/.zshrc, ~/.bashrc, etc.): export PATH=\"{}:$PATH\"",
                dir.display()
            )
        })
    }

    fn find_existing_link(target: &std::path::Path) -> Option<PathBuf> {
        candidate_dirs().into_iter().find_map(|dir| {
            let link = dir.join("nookly");
            match std::fs::read_link(&link) {
                Ok(dest) if dest == target => Some(link),
                _ => None,
            }
        })
    }

    fn dir_is_writable(dir: &std::path::Path) -> bool {
        if !dir.is_dir() {
            return false;
        }
        let probe = dir.join(".nookly-write-check");
        let writable = std::fs::write(&probe, b"").is_ok();
        let _ = std::fs::remove_file(&probe);
        writable
    }

    /// Prefers standard system/Homebrew bin dirs (almost always already on an
    /// interactive shell's PATH) over `~/.local/bin`, which needs the hint.
    fn pick_install_dir() -> AppResult<PathBuf> {
        for dir in candidate_dirs() {
            if dir.ends_with(".local/bin") {
                continue;
            }
            if dir_is_writable(&dir) {
                return Ok(dir);
            }
        }
        let home = dirs::home_dir()
            .ok_or_else(|| AppError::Db("could not resolve home directory".into()))?;
        let dir = home.join(".local/bin");
        std::fs::create_dir_all(&dir).map_err(|e| AppError::Db(e.to_string()))?;
        Ok(dir)
    }

    pub fn status() -> AppResult<CliInstallStatus> {
        let target = current_binary()?;
        if let Some(link) = find_existing_link(&target) {
            let dir = link
                .parent()
                .expect("link always has a parent")
                .to_path_buf();
            return Ok(CliInstallStatus {
                supported: true,
                installed: true,
                link_dir: Some(dir.display().to_string()),
                target_path: Some(target.display().to_string()),
                shell_hint: shell_hint_for(&dir),
            });
        }
        let dir = pick_install_dir()?;
        Ok(CliInstallStatus {
            supported: true,
            installed: false,
            link_dir: Some(dir.display().to_string()),
            target_path: Some(target.display().to_string()),
            shell_hint: shell_hint_for(&dir),
        })
    }

    pub fn install() -> AppResult<CliInstallStatus> {
        let target = current_binary()?;
        if find_existing_link(&target).is_some() {
            return status();
        }
        let dir = pick_install_dir()?;
        let link = dir.join("nookly");
        if link.exists() || link.is_symlink() {
            return Err(AppError::InvalidInput(format!(
                "{} already exists and isn't a link to this app — remove it manually first, then try again",
                link.display()
            )));
        }
        std::os::unix::fs::symlink(&target, &link)
            .map_err(|e| AppError::Db(format!("could not create {}: {e}", link.display())))?;
        status()
    }
}

#[cfg(not(unix))]
mod unix_impl {
    use super::*;

    pub fn status() -> AppResult<CliInstallStatus> {
        Ok(CliInstallStatus {
            supported: false,
            installed: false,
            link_dir: None,
            target_path: None,
            shell_hint: None,
        })
    }

    pub fn install() -> AppResult<CliInstallStatus> {
        Err(AppError::InvalidInput(
            "Automatic CLI install isn't supported on this platform yet — build the binary and \
             add it to PATH manually (see README)."
                .into(),
        ))
    }
}

#[tauri::command]
pub fn cli_install_status() -> AppResult<CliInstallStatus> {
    unix_impl::status()
}

#[tauri::command]
pub fn install_cli() -> AppResult<CliInstallStatus> {
    unix_impl::install()
}
