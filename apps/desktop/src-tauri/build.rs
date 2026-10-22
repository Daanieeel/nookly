fn main() {
    compile_dev_macos_icon();

    let on_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");

    if !on_windows_msvc {
        tauri_build::build();
        return;
    }

    // Windows needs the Common Controls v6 manifest (`windows-app-manifest.xml`) for the
    // native dialogs (`TaskDialogIndirect`). tauri-build embeds it in the app binary
    // only, so the unit test executable, which links the same dialog code through the
    // IPC command tests, fails to start with STATUS_ENTRYPOINT_NOT_FOUND. Embedding it
    // here puts it in every executable this package links, tests included.
    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");

    let manifest = std::path::Path::new(&std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}

/// `tauri dev` runs the bare binary, not an `.app`, so macOS never sees the compiled
/// `Nookly.icon` (the bundle's `Assets.car`) and the dock falls back to `icon.png`.
/// For debug builds this compiles the Icon Composer file into a small resource bundle
/// that `set_dev_dock_icon` in `lib.rs` loads. Fails soft: without Xcode's `actool` the
/// dev build keeps the PNG icon.
fn compile_dev_macos_icon() {
    use std::path::Path;
    use std::process::Command;

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos")
        || std::env::var("PROFILE").as_deref() != Ok("debug")
    {
        return;
    }
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let icon = Path::new(&manifest_dir).join("icons/Nookly.icon");
    println!("cargo:rerun-if-changed={}", icon.display());

    let bundle = Path::new(&std::env::var("OUT_DIR").unwrap()).join("NooklyDevIcon.bundle");
    let resources = bundle.join("Contents/Resources");
    if std::fs::create_dir_all(&resources).is_err() {
        return;
    }
    let compiled = Command::new("xcrun")
        .arg("actool")
        .arg(&icon)
        .arg("--compile")
        .arg(&resources)
        .args(["--output-partial-info-plist", "/dev/null"])
        .args(["--app-icon", "Nookly", "--include-all-app-icons"])
        .args(["--platform", "macosx", "--target-device", "mac"])
        .args(["--minimum-deployment-target", "10.13"])
        .output()
        .is_ok_and(|output| output.status.success());
    if !compiled {
        println!("cargo:warning=could not compile Nookly.icon, dev builds use the PNG icon");
        return;
    }
    // NSBundle only reads the asset catalog of a bundle with an Info.plist.
    let info_plist = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleIdentifier</key>
	<string>com.nookly.app.dev-icon</string>
	<key>CFBundlePackageType</key>
	<string>BNDL</string>
</dict>
</plist>
"#;
    if std::fs::write(bundle.join("Contents/Info.plist"), info_plist).is_ok() {
        println!(
            "cargo:rustc-env=NOOKLY_DEV_ICON_BUNDLE={}",
            bundle.display()
        );
    }
}
