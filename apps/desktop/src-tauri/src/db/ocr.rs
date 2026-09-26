//! Best-effort OCR for search indexing (§"File Indexing & OCR for Search"):
//! scanned/image-only PDF pages and standalone images (PNG/JPG, screenshots).
//! Both run through the same local CPU model, `pdf-inspector`'s bundled
//! PP-OCRv6 Small engine — there is no cloud OCR API involved anywhere here.
//!
//! `OcrMode::Off` (pdf-inspector's default) touches no renderer, model cache,
//! network or inference engine at all, so an ordinary text PDF costs nothing
//! extra; only a page pdf-inspector's own detector actually flags as scanned
//! reaches `Auto` mode below. The model itself downloads once (a few MB,
//! checksum-verified, cached under the OS cache dir) and needs a system ONNX
//! Runtime shared library to run — `brew install onnxruntime` on macOS, or
//! set `ORT_DYLIB_PATH` — the same "best effort, optional local tool" shape
//! as the LibreOffice dependency in `commands/office.rs`. Missing either one
//! simply means OCR is skipped; the File and its filename-only search entry
//! are unaffected.

use pdf_inspector::vision::{
    HttpModelDownloader, ModelDownloadPolicy, ModelStore, OarOcrEngine, OcrEngine, OcrMode,
    OcrOptions, OcrPdfOptions, PageTransform, RenderPixelFormat, RenderedPage, PP_OCR_V6_SMALL,
};
use std::path::Path;
use std::sync::{Arc, OnceLock};

fn ocr_options() -> OcrOptions {
    OcrOptions::new()
        .mode(OcrMode::Auto)
        .model_downloads(ModelDownloadPolicy::IfMissing)
}

/// Extracts a PDF's text, OCR-ing any page pdf-inspector's own detector flags
/// as scanned or image-only. Falls back to native-text-only extraction if OCR
/// itself can't run (no local ONNX Runtime, model download failed, ...).
pub fn extract_pdf_text(path: &Path) -> Option<String> {
    let options = OcrPdfOptions::auto().ocr(ocr_options());
    match pdf_inspector::vision::process_pdf_with_ocr(path, options) {
        Ok(result) => Some(result.markdown),
        Err(_) => pdf_inspector::process_pdf(path)
            .ok()
            .and_then(|r| r.markdown),
    }
}

/// OCRs a standalone raster image (PNG/JPG, a screenshot). `None` if the
/// image can't be decoded, no local OCR engine is available, or no text was
/// found.
pub fn extract_image_text(path: &Path) -> Option<String> {
    let img = image::open(path).ok()?.into_rgb8();
    let (width, height) = img.dimensions();
    if width == 0 || height == 0 {
        return None;
    }
    let transform = PageTransform::from_corners(
        width,
        height,
        (0.0, 0.0),
        (width as f64, 0.0),
        (0.0, height as f64),
    )?;
    let stride = width as usize * RenderPixelFormat::Rgb8.bytes_per_pixel();
    let page = RenderedPage::new(
        1,
        width as f32,
        height as f32,
        width,
        height,
        stride,
        RenderPixelFormat::Rgb8,
        img.into_raw(),
        transform,
    )
    .ok()?;

    let engine = cached_image_ocr_engine()?;
    let options = ocr_options();
    let pages = engine.recognize(&[page], &options).ok()?;
    let text = pages
        .into_iter()
        .next()?
        .spans
        .into_iter()
        .map(|span| span.text)
        .collect::<Vec<_>>()
        .join(" ");
    (!text.trim().is_empty()).then_some(text)
}

/// The engine loads model weights and starts an inference session, so it's
/// built once per process and reused — mirrors pdf-inspector's own internal
/// engine cache for the PDF OCR path, which this standalone-image path has no
/// access to.
fn cached_image_ocr_engine() -> Option<Arc<OarOcrEngine>> {
    static ENGINE: OnceLock<Option<Arc<OarOcrEngine>>> = OnceLock::new();
    ENGINE
        .get_or_init(|| {
            let options = ocr_options();
            let store = ModelStore::from_options(&options).ok()?;
            let models = store
                .resolve_or_download(
                    &PP_OCR_V6_SMALL,
                    options.model_downloads,
                    &HttpModelDownloader::default(),
                )
                .ok()?;
            Some(Arc::new(OarOcrEngine::from_models(&models).ok()?))
        })
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Needs a real local OCR stack: `ORT_DYLIB_PATH` (or a system-installed
    /// ONNX Runtime) plus a first-run model download. Not run by default —
    /// `cargo test --lib db::ocr -- --ignored` after `brew install onnxruntime`.
    #[test]
    #[ignore]
    fn ocrs_a_png_with_text() {
        let path = std::env::temp_dir().join("nookly-ocr-test.png");
        let img = image::RgbImage::from_pixel(700, 160, image::Rgb([255, 255, 255]));
        image::DynamicImage::ImageRgb8(img)
            .save(&path)
            .expect("test fixture writes");
        // A blank image proves the pipeline runs end to end (decode, render,
        // engine load) without asserting specific recognized text, which
        // needs a real rendered glyph the `image` crate alone can't draw.
        let _ = extract_image_text(&path);
        assert!(
            cached_image_ocr_engine().is_some(),
            "OCR engine failed to load — check ORT_DYLIB_PATH / onnxruntime install"
        );
    }

    #[test]
    fn a_normal_digital_pdf_never_touches_pdfium_or_onnx() {
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("digital.pdf");
        // A minimal one-page PDF with a real text-showing operator, no images:
        // pdf-inspector's detector must not flag any page as needing OCR, so
        // `Auto` mode stays on the native-only path with no pdfium/ONNX Runtime
        // touched at all — this must pass with neither installed.
        std::fs::write(
            &path,
            b"%PDF-1.4\n\
              1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n\
              2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n\
              3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 200 200]/Contents 5 0 R>>endobj\n\
              4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n\
              5 0 obj<</Length 58>>stream\n\
              BT /F1 12 Tf 20 100 Td (Nookly search test) Tj ET\n\
              endstream\n\
              endobj\n\
              trailer<</Root 1 0 R>>\n",
        )
        .unwrap();
        let text = extract_pdf_text(&path).expect("a digital PDF's text layer extracts");
        assert!(text.contains("Nookly search test"), "{text}");
    }
}
