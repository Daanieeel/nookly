//! Office documents the file viewer can't render itself (slides, legacy Word and
//! Excel, OpenDocument, iWork) are converted to PDF with LibreOffice, when it is
//! installed, and shown in the PDF viewer. Conversions are cached per file
//! version, so each is paid once.

use crate::db::files;
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

/// Big decks take a while; past this the viewer falls back to "Open in".
const CONVERT_TIMEOUT: Duration = Duration::from_secs(120);

/// LibreOffice's command line binary, wherever it is installed.
fn soffice() -> Option<PathBuf> {
    let known = [
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        "/usr/local/bin/soffice",
        "/opt/homebrew/bin/soffice",
        "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
        "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    ];
    let user_app = dirs::home_dir()
        .map(|home| home.join("Applications/LibreOffice.app/Contents/MacOS/soffice"));
    known
        .iter()
        .map(PathBuf::from)
        .chain(user_app)
        .find(|p| p.is_file())
        .or_else(|| {
            let path = std::env::var_os("PATH")?;
            std::env::split_paths(&path)
                .flat_map(|dir| ["soffice", "libreoffice"].map(|name| dir.join(name)))
                .find(|p| p.is_file())
        })
}

/// Whether previews through LibreOffice are possible on this machine.
#[tauri::command]
pub fn office_converter_available() -> bool {
    soffice().is_some()
}

/// The PDF rendering of an office File, converting it first unless a
/// conversion of this exact version is cached. Returns the PDF's path.
#[tauri::command]
pub async fn convert_office_to_pdf(
    app: AppHandle,
    state: State<'_, DbState>,
    entity_id: String,
) -> AppResult<String> {
    let source = {
        let conn = state.0.lock().unwrap();
        let file = files::get_file(&conn, &entity_id)?;
        file.local_path
            .or(file.source_path)
            .ok_or_else(|| AppError::InvalidInput("this file is only a link".into()))?
    };
    let soffice = soffice().ok_or_else(|| {
        AppError::InvalidInput(
            "LibreOffice isn't installed, so this file can't be previewed".into(),
        )
    })?;
    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("office-previews");
    let cached = cache_dir.join(format!(
        "{entity_id}-{}.pdf",
        version_tag(Path::new(&source))?
    ));
    if cached.is_file() {
        return Ok(cached.to_string_lossy().into_owned());
    }

    tauri::async_runtime::spawn_blocking(move || {
        convert(
            &soffice,
            Path::new(&source),
            &cache_dir,
            &cached,
            &entity_id,
        )
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()))?
}

/// Size and modification time: a replaced or edited file converts again.
fn version_tag(path: &Path) -> AppResult<String> {
    let meta = std::fs::metadata(path)
        .map_err(|e| AppError::Io(format!("couldn't read {}: {e}", path.display())))?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_secs());
    Ok(format!("{}-{modified}", meta.len()))
}

fn convert(
    soffice: &Path,
    source: &Path,
    cache_dir: &Path,
    cached: &Path,
    entity_id: &str,
) -> AppResult<String> {
    let work = std::env::temp_dir().join(format!("nookly-office-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&work).map_err(|e| AppError::Io(e.to_string()))?;
    // A profile of its own, so a LibreOffice the user has open doesn't swallow the job.
    let profile = url::Url::from_directory_path(work.join("profile"))
        .map_err(|_| AppError::Io("couldn't set up LibreOffice".into()))?;
    let mut child = std::process::Command::new(soffice)
        .arg(format!("-env:UserInstallation={profile}"))
        .args([
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
        ])
        .arg(&work)
        .arg(source)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| AppError::Io(format!("couldn't start LibreOffice: {e}")))?;

    let started = std::time::Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| AppError::Io(e.to_string()))? {
            break status;
        }
        if started.elapsed() > CONVERT_TIMEOUT {
            let _ = child.kill();
            let _ = std::fs::remove_dir_all(&work);
            return Err(AppError::Io(
                "LibreOffice took too long to convert the file".into(),
            ));
        }
        std::thread::sleep(Duration::from_millis(200));
    };

    let result = (|| {
        if !status.success() {
            return Err(AppError::Io("LibreOffice couldn't convert the file".into()));
        }
        let stem = source.file_stem().unwrap_or_default();
        // `stem.pdf`, not `with_extension`, which would eat the ".v2" of "report.v2".
        let produced = work.join(format!("{}.pdf", stem.to_string_lossy()));
        std::fs::create_dir_all(cache_dir).map_err(|e| AppError::Io(e.to_string()))?;
        // Older versions of this file's preview are no longer needed.
        if let Ok(entries) = std::fs::read_dir(cache_dir) {
            for entry in entries.flatten() {
                if entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(&format!("{entity_id}-"))
                {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
        std::fs::rename(&produced, cached)
            .or_else(|_| std::fs::copy(&produced, cached).map(|_| ()))
            .map_err(|_| AppError::Io("LibreOffice didn't produce a PDF".into()))?;
        Ok(cached.to_string_lossy().into_owned())
    })();
    let _ = std::fs::remove_dir_all(&work);
    result
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// Stands in for LibreOffice: writes `<outdir>/<stem>.pdf` like `--convert-to pdf`.
    fn fake_soffice(dir: &Path, succeed: bool) -> PathBuf {
        let script = dir.join("soffice");
        let body = if succeed {
            r#"#!/bin/sh
out=""; last=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--outdir" ]; then out="$2"; shift; fi
  last="$1"; shift
done
name=$(basename "$last"); stem="${name%.*}"
printf '%%PDF-1.4' > "$out/$stem.pdf"
"#
        } else {
            "#!/bin/sh\nexit 1\n"
        };
        std::fs::write(&script, body).unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        script
    }

    #[test]
    fn converts_into_the_cache_and_drops_older_versions() {
        let dir = std::env::temp_dir().join(format!("nookly-office-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("report.v2.pptx");
        std::fs::write(&source, b"deck").unwrap();
        let cache = dir.join("cache");
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::write(cache.join("abc-1-1.pdf"), b"old").unwrap();
        std::fs::write(cache.join("other-1-1.pdf"), b"keep").unwrap();

        let cached = cache.join("abc-4-2.pdf");
        let out = convert(&fake_soffice(&dir, true), &source, &cache, &cached, "abc").unwrap();
        assert_eq!(out, cached.to_string_lossy());
        assert_eq!(std::fs::read(&cached).unwrap(), b"%PDF-1.4");
        assert!(!cache.join("abc-1-1.pdf").exists());
        assert!(cache.join("other-1-1.pdf").exists());

        let failed = convert(
            &fake_soffice(&dir, false),
            &source,
            &cache,
            &cache.join("x.pdf"),
            "x",
        );
        assert!(failed.is_err());
    }
}
