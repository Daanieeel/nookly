fn main() {
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
