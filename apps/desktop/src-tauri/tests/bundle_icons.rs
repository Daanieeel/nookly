//! Guards the Linux icon setup from issue #67. Fedora (GNOME) ignores oversized icons such as
//! 1024x1024, so packages must ship standard hicolor sizes plus a scalable SVG.

use std::{fs, path::Path};

use serde_json::Value;

const STANDARD_SIZES: [u32; 6] = [32, 48, 64, 128, 256, 512];

fn root() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

fn config() -> Value {
    let raw =
        fs::read_to_string(root().join("tauri.conf.json")).expect("tauri.conf.json is readable");
    serde_json::from_str(&raw).expect("tauri.conf.json is valid JSON")
}

fn png_size(path: &Path) -> (u32, u32) {
    let bytes = fs::read(path).unwrap_or_else(|_| panic!("{} is readable", path.display()));
    assert_eq!(
        &bytes[..8],
        b"\x89PNG\r\n\x1a\n",
        "{} is a PNG",
        path.display()
    );
    let read =
        |at: usize| u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
    (read(16), read(20))
}

fn bundled_pngs() -> Vec<(String, (u32, u32))> {
    config()["bundle"]["icon"]
        .as_array()
        .expect("bundle.icon is a list")
        .iter()
        .filter_map(|icon| icon.as_str())
        .filter(|icon| icon.ends_with(".png"))
        .map(|icon| (icon.to_string(), png_size(&root().join(icon))))
        .collect()
}

#[test]
fn bundles_every_standard_linux_png_size() {
    let sizes: Vec<u32> = bundled_pngs().iter().map(|(_, (w, _))| *w).collect();
    for size in STANDARD_SIZES {
        assert!(
            sizes.contains(&size),
            "missing {size}x{size} PNG in bundle.icon"
        );
    }
}

#[test]
fn bundled_pngs_are_square_and_not_oversized() {
    for (name, (w, h)) in bundled_pngs() {
        assert_eq!(w, h, "{name} must be square");
        assert!(
            w <= 512,
            "{name} is {w}px, Linux icon themes ignore sizes above 512"
        );
    }
}

#[test]
fn linux_packages_install_scalable_svg() {
    let config = config();
    let target = "usr/share/icons/hicolor/scalable/apps/nookly.svg";
    for format in ["deb", "rpm", "appimage"] {
        let files = &config["bundle"]["linux"][format]["files"];
        let source = files[target]
            .as_str()
            .unwrap_or_else(|| panic!("bundle.linux.{format}.files must map {target}"));
        let svg = fs::read_to_string(root().join(source)).expect("scalable icon source exists");
        assert!(svg.contains("<svg"), "{source} must be an SVG");
    }
}
