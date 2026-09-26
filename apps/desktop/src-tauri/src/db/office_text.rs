//! Best-effort native text extraction for Office documents (search indexing
//! only, §"File Indexing & OCR for Search"). No OCR involved: docx, pptx and
//! xlsx already carry their text as plain XML, so this just walks the OOXML
//! zip package. Anything malformed or unreadable yields `None`, same as a
//! PDF with no text layer — the File entity itself is never affected.

use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::Read;
use std::path::Path;

/// Dispatches by extension. `None` for anything not handled here.
pub fn extract_office_text(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    let text = match ext.as_str() {
        "docx" => extract_docx(path),
        "pptx" => extract_pptx(path),
        "xlsx" => extract_xlsx(path),
        _ => return None,
    }?;
    let text = text.trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// Collects the text inside every `<w:t>` run in `word/document.xml`,
/// starting a new line on each paragraph end so the result reads like text,
/// not one long ribbon.
fn extract_docx(path: &Path) -> Option<String> {
    let mut zip = open_zip(path)?;
    let xml = read_zip_entry(&mut zip, "word/document.xml")?;
    Some(text_from_runs(&xml, "w:t", "w:p"))
}

/// Slides are `ppt/slides/slide1.xml`, `slide2.xml`, ... in no guaranteed
/// zip order, so they're collected and sorted by their number first.
fn extract_pptx(path: &Path) -> Option<String> {
    let mut zip = open_zip(path)?;
    let mut slides: Vec<(u32, String)> = Vec::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).ok()?;
        let Some(number) = slide_number(entry.name()) else {
            continue;
        };
        let mut xml = String::new();
        if entry.read_to_string(&mut xml).is_err() {
            continue;
        }
        slides.push((number, xml));
    }
    if slides.is_empty() {
        return None;
    }
    slides.sort_by_key(|(number, _)| *number);
    Some(
        slides
            .into_iter()
            .map(|(_, xml)| text_from_runs(&xml, "a:t", "a:p"))
            .collect::<Vec<_>>()
            .join("\n\n"),
    )
}

/// `ppt/slides/slideN.xml` — anything else (layouts, masters, notes) is skipped.
fn slide_number(entry_name: &str) -> Option<u32> {
    let name = entry_name.strip_prefix("ppt/slides/slide")?;
    name.strip_suffix(".xml")?.parse().ok()
}

/// Every cell on every sheet, in document order, one row per line.
fn extract_xlsx(path: &Path) -> Option<String> {
    use calamine::{open_workbook, Reader as _, Xlsx};
    let mut workbook: Xlsx<_> = open_workbook(path).ok()?;
    let sheet_names = workbook.sheet_names().to_vec();
    let mut out = String::new();
    for name in sheet_names {
        let Ok(range) = workbook.worksheet_range(&name) else {
            continue;
        };
        for row in range.rows() {
            let line = row
                .iter()
                .map(|cell| cell.to_string())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            if !line.is_empty() {
                out.push_str(&line);
                out.push('\n');
            }
        }
    }
    Some(out)
}

fn open_zip(path: &Path) -> Option<zip::ZipArchive<std::fs::File>> {
    let file = std::fs::File::open(path).ok()?;
    zip::ZipArchive::new(file).ok()
}

fn read_zip_entry(zip: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    let mut entry = zip.by_name(name).ok()?;
    let mut xml = String::new();
    entry.read_to_string(&mut xml).ok()?;
    Some(xml)
}

/// Pulls plain text out of every `text_tag` element, inserting a newline at
/// the close of every `paragraph_tag`. Malformed XML just stops early and
/// returns whatever was gathered so far, rather than losing everything.
fn text_from_runs(xml: &str, text_tag: &str, paragraph_tag: &str) -> String {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut out = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(e)) if e.local_name().into_inner() == local_name(text_tag) => {
                in_text = true;
            }
            Ok(Event::End(e)) if e.local_name().into_inner() == local_name(text_tag) => {
                in_text = false;
            }
            Ok(Event::End(e)) if e.local_name().into_inner() == local_name(paragraph_tag) => {
                out.push('\n');
            }
            Ok(Event::Text(e)) if in_text => match quick_xml::escape::unescape(e.as_ref()) {
                Ok(text) => out.push_str(&text),
                Err(_) => out.push_str(e.as_ref()),
            },
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    out
}

/// `quick_xml`'s `local_name()` strips the namespace prefix, so match against
/// the tag's bare name (`t`, not `w:t`).
fn local_name(qualified: &str) -> &str {
    qualified
        .rsplit_once(':')
        .map(|(_, local)| local)
        .unwrap_or(qualified)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_zip(path: &Path, entries: &[(&str, &str)]) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for (name, contents) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(contents.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn extracts_docx_paragraphs() {
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.docx");
        write_zip(
            &path,
            &[(
                "word/document.xml",
                r#"<w:document xmlns:w="ns"><w:body>
                    <w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p>
                    <w:p><w:r><w:t>Second line</w:t></w:r></w:p>
                </w:body></w:document>"#,
            )],
        );
        let text = extract_office_text(&path).unwrap();
        assert_eq!(text, "Hello world\nSecond line");
    }

    #[test]
    fn extracts_pptx_slides_in_order() {
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.pptx");
        write_zip(
            &path,
            &[
                (
                    "ppt/slides/slide2.xml",
                    r#"<p:sld xmlns:a="ns"><a:t>Second slide</a:t></p:sld>"#,
                ),
                (
                    "ppt/slides/slide1.xml",
                    r#"<p:sld xmlns:a="ns"><a:t>First slide</a:t></p:sld>"#,
                ),
            ],
        );
        let text = extract_office_text(&path).unwrap();
        assert!(text.starts_with("First slide"));
        assert!(text.ends_with("Second slide"));
    }

    #[test]
    fn extracts_xlsx_cells() {
        let dir = std::env::temp_dir().join(format!("nookly-test-{}", crate::db::new_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("a.xlsx");
        write_zip(
            &path,
            &[
                (
                    "[Content_Types].xml",
                    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
                      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
                      <Default Extension="xml" ContentType="application/xml"/>
                      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
                      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
                    </Types>"#,
                ),
                (
                    "_rels/.rels",
                    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
                    </Relationships>"#,
                ),
                (
                    "xl/workbook.xml",
                    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                      <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
                    </workbook>"#,
                ),
                (
                    "xl/_rels/workbook.xml.rels",
                    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
                      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
                    </Relationships>"#,
                ),
                (
                    "xl/worksheets/sheet1.xml",
                    r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
                    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
                      <sheetData>
                        <row r="1">
                          <c r="A1" t="inlineStr"><is><t>Hello</t></is></c>
                          <c r="B1" t="inlineStr"><is><t>World</t></is></c>
                        </row>
                      </sheetData>
                    </worksheet>"#,
                ),
            ],
        );
        let text = extract_office_text(&path).unwrap();
        assert_eq!(text, "Hello World");
    }

    #[test]
    fn returns_none_for_unhandled_extension() {
        let path = Path::new("/tmp/does-not-matter.png");
        assert!(extract_office_text(path).is_none());
    }
}
