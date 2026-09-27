fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    if let Err(e) = link_apple_intelligence_dylib() {
        // Best effort: a dev machine without the crate resolved yet (first
        // `cargo check` before dependencies download) shouldn't hard-fail the
        // whole build — the link step itself still fails loudly later if the
        // dylib is genuinely missing.
        println!("cargo:warning=Apple Intelligence dylib setup skipped: {e}");
    }
}

/// `tauri-plugin-apple-intelligence` ships `prebuilt/libappleai.dylib` inside
/// its own crate directory and links it via its own `build.rs`, but only sets
/// an rpath for *its* test binaries (see the crate's README, "Native
/// library"). Consumers own bundling the dylib and setting their own rpath —
/// this does both: an rpath straight into the crate's cargo registry cache
/// (so `cargo test`/`cargo run` and `tauri dev` resolve it immediately, no
/// bundling needed) and a copy under `resources/` for the shipped `.app`
/// (referenced by `tauri.conf.json`'s `bundle.macOS.files`), with a matching
/// `@executable_path/../Resources` rpath for that bundled case.
#[cfg(target_os = "macos")]
fn link_apple_intelligence_dylib() -> Result<(), Box<dyn std::error::Error>> {
    let metadata = cargo_metadata::MetadataCommand::new().exec()?;
    let package = metadata
        .packages
        .iter()
        .find(|p| p.name.as_str() == "tauri-plugin-apple-intelligence")
        .ok_or("tauri-plugin-apple-intelligence isn't in the resolved dependency graph")?;
    let manifest_dir = package
        .manifest_path
        .parent()
        .ok_or("tauri-plugin-apple-intelligence has no manifest directory")?;
    let prebuilt_dir = manifest_dir.join("prebuilt");
    let dylib_src = prebuilt_dir.join("libappleai.dylib");
    if !dylib_src.exists() {
        return Err(format!("{dylib_src} is missing from the resolved crate").into());
    }

    println!("cargo:rustc-link-arg=-Wl,-rpath,{prebuilt_dir}");
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Resources");

    let resources_dir = std::path::Path::new("resources");
    std::fs::create_dir_all(resources_dir)?;
    let dest = resources_dir.join("libappleai.dylib");
    // Idempotent: only write when the copy is missing or stale, so a build
    // that changes nothing else doesn't touch this file's mtime. `resources/`
    // is also in `.taurignore`, but this holds even if that ever lapses —
    // `tauri dev`'s watcher rebuilding in response to *our own build's*
    // output is exactly the loop that made `resources/libappleai.dylib`
    // "changed" on every single build.
    let needs_copy = match (std::fs::metadata(&dylib_src), std::fs::metadata(&dest)) {
        (Ok(src_meta), Ok(dest_meta)) => src_meta.len() != dest_meta.len(),
        _ => true,
    };
    if needs_copy {
        std::fs::copy(&dylib_src, &dest)?;
    }
    println!("cargo:rerun-if-changed={dylib_src}");
    Ok(())
}
