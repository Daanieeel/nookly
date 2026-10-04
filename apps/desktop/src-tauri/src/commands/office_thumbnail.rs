//! Tile thumbnails for office files, from macOS Quick Look (`qlmanage`), so no
//! extra software is needed. Elsewhere there is no thumbnail and the Files list
//! keeps its file type icon. Cached next to the PDF previews, per file version.

use super::office::version_tag;
use crate::db::files;
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const QLMANAGE: &str = "/usr/bin/qlmanage";
const THUMBNAIL_PX: &str = "480";
const TIMEOUT: Duration = Duration::from_secs(20);

/// The thumbnail PNG of an office File, or `None` where Quick Look isn't
/// available or couldn't draw it. Returns the PNG's path.
#[tauri::command]
pub async fn office_thumbnail(
    app: AppHandle,
    state: State<'_, DbState>,
    entity_id: String,
) -> AppResult<Option<String>> {
    if !cfg!(target_os = "macos") {
        return Ok(None);
    }
    let source = {
        let conn = state.0.lock().unwrap();
        let file = files::get_file(&conn, &entity_id)?;
        match file.local_path.or(file.source_path) {
            Some(path) => PathBuf::from(path),
            None => return Ok(None),
        }
    };
    let cache_dir = crate::db::resolve_app_data_dir(
        app.path()
            .app_data_dir()
            .map_err(|e| AppError::Io(e.to_string()))?,
    )
    .join("office-previews");
    let cached = cache_dir.join(format!("thumb-{entity_id}-{}.png", version_tag(&source)?));
    if cached.is_file() {
        return Ok(Some(cached.to_string_lossy().into_owned()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        Ok(generate(
            Path::new(QLMANAGE),
            &source,
            &cache_dir,
            &cached,
            &entity_id,
        ))
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?
}

/// Runs `qlmanage -t` into a scratch folder and moves the PNG into the cache,
/// dropping older thumbnails of the same File.
fn generate(
    qlmanage: &Path,
    source: &Path,
    cache_dir: &Path,
    cached: &Path,
    entity_id: &str,
) -> Option<String> {
    let work = std::env::temp_dir().join(format!("nookly-thumb-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&work).ok()?;
    let result = (|| {
        let mut child = std::process::Command::new(qlmanage)
            .args(["-t", "-s", THUMBNAIL_PX, "-o"])
            .arg(&work)
            .arg(source)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .ok()?;
        let started = std::time::Instant::now();
        let status = loop {
            if let Some(status) = child.try_wait().ok()? {
                break status;
            }
            if started.elapsed() > TIMEOUT {
                let _ = child.kill();
                return None;
            }
            std::thread::sleep(Duration::from_millis(50));
        };
        if !status.success() {
            return None;
        }
        // Quick Look names the output `<file name>.png`, extension included.
        let produced = work.join(format!("{}.png", source.file_name()?.to_string_lossy()));
        if std::fs::metadata(&produced).ok()?.len() == 0 {
            return None;
        }
        std::fs::create_dir_all(cache_dir).ok()?;
        for entry in std::fs::read_dir(cache_dir).ok()?.flatten() {
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with(&format!("thumb-{entity_id}-"))
            {
                let _ = std::fs::remove_file(entry.path());
            }
        }
        std::fs::rename(&produced, cached)
            .or_else(|_| std::fs::copy(&produced, cached).map(|_| ()))
            .ok()?;
        Some(cached.to_string_lossy().into_owned())
    })();
    let _ = std::fs::remove_dir_all(&work);
    result
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// Stands in for `qlmanage -t -s N -o <dir> <file>`: writes `<dir>/<file name>.png`.
    fn fake_qlmanage(dir: &Path, succeed: bool) -> PathBuf {
        let script = dir.join("qlmanage");
        let body = if succeed {
            r#"#!/bin/sh
out=""; last=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then out="$2"; shift; fi
  last="$1"; shift
done
printf 'png' > "$out/$(basename "$last").png"
"#
        } else {
            "#!/bin/sh\nexit 1\n"
        };
        std::fs::write(&script, body).unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        script
    }

    #[test]
    fn caches_the_thumbnail_and_drops_older_ones() {
        let dir = std::env::temp_dir().join(format!("nookly-thumb-test-{}", uuid::Uuid::new_v4()));
        let cache = dir.join("cache");
        std::fs::create_dir_all(&cache).unwrap();
        let source = dir.join("report.v2.docx");
        std::fs::write(&source, b"doc").unwrap();
        std::fs::write(cache.join("thumb-abc-1-1.png"), b"old").unwrap();
        std::fs::write(cache.join("thumb-other-1-1.png"), b"keep").unwrap();
        std::fs::write(cache.join("abc-1-1.pdf"), b"pdf").unwrap();

        let cached = cache.join("thumb-abc-3-2.png");
        let out = generate(&fake_qlmanage(&dir, true), &source, &cache, &cached, "abc");
        assert_eq!(out.as_deref(), Some(&*cached.to_string_lossy()));
        assert_eq!(std::fs::read(&cached).unwrap(), b"png");
        assert!(!cache.join("thumb-abc-1-1.png").exists());
        assert!(cache.join("thumb-other-1-1.png").exists());
        assert!(cache.join("abc-1-1.pdf").exists());
    }

    #[test]
    fn no_thumbnail_when_quick_look_fails() {
        let dir = std::env::temp_dir().join(format!("nookly-thumb-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("a.docx");
        std::fs::write(&source, b"doc").unwrap();
        let cached = dir.join("cache/thumb-x-1-1.png");
        let out = generate(
            &fake_qlmanage(&dir, false),
            &source,
            &dir.join("cache"),
            &cached,
            "x",
        );
        assert!(out.is_none());
        assert!(!cached.exists());
    }
}
