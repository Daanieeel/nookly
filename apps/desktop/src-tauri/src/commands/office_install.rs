//! Installing LibreOffice from the file viewer, for previews of formats the app
//! can't draw itself. Two ways on macOS: Homebrew when it's there, or the
//! official disk image, checked (SHA-256 from The Document Foundation, its code
//! signature and Gatekeeper) before it's copied to Applications.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::io::{BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

/// Where installs report progress, for the button that started them.
const PROGRESS_EVENT: &str = "libreoffice-install";
const RELEASES: &str = "https://download.documentfoundation.org/libreoffice/stable/";
/// The developer every LibreOffice build for macOS is signed by.
const SIGNER: &str = "Developer ID Application: The Document Foundation";

static INSTALLING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOptions {
    /// `brew install --cask libreoffice` is possible.
    pub brew: bool,
    /// The official disk image can be installed directly (macOS).
    pub direct: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    phase: &'static str,
    /// 0 to 100 while a download's size is known.
    percent: Option<f64>,
}

fn report(app: &AppHandle, phase: &'static str, percent: Option<f64>) {
    let _ = app.emit(PROGRESS_EVENT, Progress { phase, percent });
}

fn brew() -> Option<PathBuf> {
    ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.is_file())
}

#[tauri::command]
pub fn libreoffice_install_options() -> InstallOptions {
    InstallOptions {
        brew: brew().is_some(),
        direct: cfg!(target_os = "macos"),
    }
}

/// Installs LibreOffice with `method` ("brew" or "direct"), one install at a time.
#[tauri::command]
pub async fn install_libreoffice(app: AppHandle, method: String) -> AppResult<()> {
    if INSTALLING.swap(true, Ordering::SeqCst) {
        return Err(AppError::InvalidInput(
            "LibreOffice is already being installed".into(),
        ));
    }
    let result = tauri::async_runtime::spawn_blocking(move || match method.as_str() {
        "brew" => install_with_brew(&app),
        "direct" => install_directly(&app),
        other => Err(AppError::InvalidInput(format!(
            "unknown install method {other}"
        ))),
    })
    .await
    .map_err(|e| AppError::Io(e.to_string()));
    INSTALLING.store(false, Ordering::SeqCst);
    result?
}

fn install_with_brew(app: &AppHandle) -> AppResult<()> {
    let brew = brew().ok_or_else(|| AppError::InvalidInput("Homebrew isn't installed".into()))?;
    report(app, "starting", None);
    let mut child = Command::new(brew)
        .args(["install", "--cask", "libreoffice"])
        .env("NONINTERACTIVE", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Io(format!("couldn't start Homebrew: {e}")))?;

    // Homebrew narrates on stdout and draws curl's progress bar on stderr,
    // redrawn with carriage returns rather than new lines.
    let stdout = child.stdout.take();
    let narrator = app.clone();
    let narration = std::thread::spawn(move || {
        let mut tail = Vec::new();
        for line in std::io::BufReader::new(stdout.expect("piped"))
            .lines()
            .map_while(Result::ok)
        {
            if line.contains("Downloading") {
                report(&narrator, "downloading", None);
            } else if line.contains("Installing") || line.contains("Moving App") {
                report(&narrator, "installing", None);
            }
            tail.push(line);
        }
        tail
    });
    let mut stderr = child.stderr.take().expect("piped");
    let mut errors = String::new();
    let mut chunk = [0u8; 4096];
    let percent = regex::Regex::new(r"(\d{1,3}(?:\.\d)?)%").expect("valid pattern");
    while let Ok(read) = stderr.read(&mut chunk) {
        if read == 0 {
            break;
        }
        let text = String::from_utf8_lossy(&chunk[..read]);
        if let Some(last) = percent.captures_iter(&text).last() {
            report(app, "downloading", last[1].parse().ok());
        }
        errors.push_str(&text);
    }
    let status = child.wait().map_err(|e| AppError::Io(e.to_string()))?;
    let tail = narration.join().unwrap_or_default();
    if !status.success() {
        let reason = errors
            .lines()
            .chain(tail.iter().map(String::as_str))
            .rfind(|l| l.contains("Error"))
            .unwrap_or("Homebrew couldn't install LibreOffice")
            .trim()
            .to_string();
        return Err(AppError::Io(reason));
    }
    report(app, "done", Some(100.0));
    Ok(())
}

/// The newest stable release, e.g. "26.8.0", from the release index.
fn latest_version(client: &reqwest::blocking::Client) -> AppResult<String> {
    let index = client
        .get(RELEASES)
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map_err(|e| AppError::Io(format!("couldn't reach LibreOffice's download server: {e}")))?;
    let pattern = regex::Regex::new(r#"href="(\d+)\.(\d+)\.(\d+)/""#).expect("valid pattern");
    pattern
        .captures_iter(&index)
        .filter_map(|c| {
            Some((
                c[1].parse::<u32>().ok()?,
                c[2].parse::<u32>().ok()?,
                c[3].parse::<u32>().ok()?,
            ))
        })
        .max()
        .map(|(a, b, c)| format!("{a}.{b}.{c}"))
        .ok_or_else(|| AppError::Io("couldn't find a LibreOffice release to install".into()))
}

/// The disk image for this Mac's chip: `(folder, file name)`.
fn image_for(version: &str) -> (String, String) {
    let (folder, arch) = if cfg!(target_arch = "aarch64") {
        ("aarch64", "aarch64")
    } else {
        ("x86_64", "x86-64")
    };
    (
        format!("{RELEASES}{version}/mac/{folder}/"),
        format!("LibreOffice_{version}_MacOS_{arch}.dmg"),
    )
}

fn install_directly(app: &AppHandle) -> AppResult<()> {
    if !cfg!(target_os = "macos") {
        return Err(AppError::InvalidInput(
            "installing LibreOffice from Nookly works on macOS only so far".into(),
        ));
    }
    report(app, "starting", None);
    let client = reqwest::blocking::Client::builder()
        .timeout(None)
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| AppError::Io(e.to_string()))?;
    let version = latest_version(&client)?;
    let (folder, name) = image_for(&version);

    // The checksum comes from The Document Foundation's own server; the image
    // itself may come from any mirror it redirects to.
    let expected = client
        .get(format!("{folder}{name}.sha256"))
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
        .map_err(|e| AppError::Io(format!("couldn't get the download's checksum: {e}")))?
        .split_whitespace()
        .next()
        .map(str::to_ascii_lowercase)
        .filter(|h| h.len() == 64)
        .ok_or_else(|| AppError::Io("the download's checksum is unreadable".into()))?;

    let work = std::env::temp_dir().join(format!("nookly-libreoffice-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&work).map_err(|e| AppError::Io(e.to_string()))?;
    let result = (|| {
        let image = work.join(&name);
        download(app, &client, &format!("{folder}{name}"), &image, &expected)?;
        report(app, "installing", None);
        install_image(&image, &work.join("mount"))
    })();
    let _ = std::fs::remove_dir_all(&work);
    result?;
    report(app, "done", Some(100.0));
    Ok(())
}

/// Streams `url` into `dest`, reporting progress, and checks its SHA-256.
fn download(
    app: &AppHandle,
    client: &reqwest::blocking::Client,
    url: &str,
    dest: &Path,
    expected_sha256: &str,
) -> AppResult<()> {
    use sha2::{Digest, Sha256};
    let mut response = client
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| AppError::Io(format!("couldn't download LibreOffice: {e}")))?;
    let total = response.content_length();
    let mut file = std::fs::File::create(dest).map_err(|e| AppError::Io(e.to_string()))?;
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    let mut last_percent = -1.0;
    let mut buffer = vec![0u8; 256 * 1024];
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|e| AppError::Io(format!("the download broke off: {e}")))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|e| AppError::Io(e.to_string()))?;
        hasher.update(&buffer[..read]);
        received += read as u64;
        if let Some(total) = total.filter(|t| *t > 0) {
            let percent = (received as f64 / total as f64 * 100.0).floor();
            if percent > last_percent {
                last_percent = percent;
                report(app, "downloading", Some(percent));
            }
        }
    }
    // sha2 0.11's digest output no longer implements `LowerHex` directly.
    let actual = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    if actual != expected_sha256 {
        return Err(AppError::Io(
            "the download doesn't match LibreOffice's published checksum, so it wasn't installed"
                .into(),
        ));
    }
    Ok(())
}

fn run(command: &mut Command, what: &str) -> AppResult<std::process::Output> {
    let output = command
        .output()
        .map_err(|e| AppError::Io(format!("couldn't {what}: {e}")))?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(AppError::Io(format!(
            "couldn't {what}: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )))
    }
}

/// Mounts the image, checks the app inside and copies it to Applications
/// (the user's own when the shared folder isn't writable).
fn install_image(image: &Path, mount: &Path) -> AppResult<()> {
    std::fs::create_dir_all(mount).map_err(|e| AppError::Io(e.to_string()))?;
    run(
        Command::new("hdiutil")
            .args(["attach", "-nobrowse", "-readonly", "-quiet", "-mountpoint"])
            .arg(mount)
            .arg(image),
        "open the LibreOffice disk image",
    )?;
    let result = (|| {
        let app = mount.join("LibreOffice.app");
        verify_signature(&app)?;
        let shared = PathBuf::from("/Applications/LibreOffice.app");
        if run(
            Command::new("ditto").arg(&app).arg(&shared),
            "copy LibreOffice",
        )
        .is_ok()
        {
            return Ok(());
        }
        let home = dirs::home_dir().ok_or_else(|| AppError::Io("no home folder".into()))?;
        run(
            Command::new("ditto")
                .arg(&app)
                .arg(home.join("Applications/LibreOffice.app")),
            "copy LibreOffice to Applications",
        )
        .map(|_| ())
    })();
    let _ = Command::new("hdiutil")
        .args(["detach", "-quiet"])
        .arg(mount)
        .status();
    result
}

/// The app must be intact, signed by The Document Foundation, and accepted by Gatekeeper.
fn verify_signature(app: &Path) -> AppResult<()> {
    run(
        Command::new("codesign")
            .args(["--verify", "--deep", "--strict"])
            .arg(app),
        "verify LibreOffice's signature",
    )?;
    let details = run(
        Command::new("codesign")
            .args(["-dv", "--verbose=2"])
            .arg(app),
        "read LibreOffice's signature",
    )?;
    // `codesign -dv` writes its details to stderr.
    let authority = String::from_utf8_lossy(&details.stderr);
    if !authority
        .lines()
        .any(|l| l.starts_with("Authority=") && l.contains(SIGNER))
    {
        return Err(AppError::Io(
            "LibreOffice's download isn't signed by The Document Foundation, so it wasn't installed".into(),
        ));
    }
    run(
        Command::new("spctl")
            .args(["--assess", "--type", "execute"])
            .arg(app),
        "have macOS approve LibreOffice",
    )
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Talks to The Document Foundation's server; `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn finds_the_latest_image_and_its_checksum() {
        let client = reqwest::blocking::Client::new();
        let version = latest_version(&client).unwrap();
        let (folder, name) = image_for(&version);
        let head = client.head(format!("{folder}{name}")).send().unwrap();
        assert!(
            head.status().is_success(),
            "{} for {folder}{name}",
            head.status()
        );
        let sum = client
            .get(format!("{folder}{name}.sha256"))
            .send()
            .unwrap()
            .text()
            .unwrap();
        assert_eq!(sum.split_whitespace().next().unwrap().len(), 64);
        assert!(sum.contains(&name));
    }
}
