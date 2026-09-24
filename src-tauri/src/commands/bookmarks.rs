use crate::db::bookmarks::{self, Bookmark};
use crate::db::DbState;
use crate::error::{AppError, AppResult};
use regex::Regex;
use tauri::State;

#[tauri::command]
pub fn create_bookmark(
    state: State<DbState>,
    space_id: String,
    url: String,
) -> AppResult<Bookmark> {
    let conn = state.0.lock().unwrap();
    bookmarks::create_bookmark(&conn, space_id, url)
}

#[tauri::command]
pub fn get_bookmark(state: State<DbState>, entity_id: String) -> AppResult<Bookmark> {
    let conn = state.0.lock().unwrap();
    bookmarks::get_bookmark(&conn, &entity_id)
}

#[tauri::command]
pub fn list_bookmarks(state: State<DbState>, space_id: String) -> AppResult<Vec<Bookmark>> {
    let conn = state.0.lock().unwrap();
    bookmarks::list_bookmarks(&conn, &space_id)
}

#[tauri::command]
pub fn update_bookmark_url(
    state: State<DbState>,
    entity_id: String,
    url: String,
) -> AppResult<Bookmark> {
    let conn = state.0.lock().unwrap();
    bookmarks::update_bookmark_url(&conn, &entity_id, url)
}

/// Best-effort metadata fetch (§5.10). While offline this simply fails and the
/// frontend keeps showing the "added on [date]" placeholder it already has;
/// the caller is expected to retry once connectivity returns.
#[tauri::command]
pub async fn fetch_bookmark_metadata(
    state: State<'_, DbState>,
    entity_id: String,
    url: String,
) -> AppResult<Bookmark> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Db(format!("fetch failed: {e}")))?;
    // Relative icon and image paths resolve against where redirects ended up.
    let base = response.url().to_string();
    let html = response
        .text()
        .await
        .map_err(|e| AppError::Db(format!("read body failed: {e}")))?;
    let PageMetadata {
        title,
        description,
        preview_image_url,
        favicon_url,
    } = page_metadata(&html, &base);

    {
        let conn = state.0.lock().unwrap();
        bookmarks::update_metadata(
            &conn,
            &entity_id,
            title,
            favicon_url,
            preview_image_url,
            description,
        )?;
        let bookmark = bookmarks::get_bookmark(&conn, &entity_id)?;
        Ok(bookmark)
    }
}

/// What a bookmark card shows, read from the page's `<head>`.
#[derive(Debug, PartialEq)]
struct PageMetadata {
    title: Option<String>,
    description: Option<String>,
    preview_image_url: Option<String>,
    favicon_url: Option<String>,
}

fn page_metadata(html: &str, base_url: &str) -> PageMetadata {
    let metas: Vec<Attrs> = tags(html, "meta").collect();
    let meta = |names: &[&str]| {
        names.iter().find_map(|name| {
            metas.iter().find_map(|attrs| {
                let key = attrs.get("property").or_else(|| attrs.get("name"))?;
                key.eq_ignore_ascii_case(name)
                    .then(|| attrs.get("content"))
                    .flatten()
                    .map(|content| html_unescape(content.trim()))
                    .filter(|content| !content.is_empty())
            })
        })
    };
    static TITLE: std::sync::LazyLock<Regex> =
        std::sync::LazyLock::new(|| Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap());
    let title = meta(&["og:title", "twitter:title"]).or_else(|| {
        TITLE
            .captures(html)
            .map(|c| html_unescape(c[1].trim()))
            .filter(|t| !t.is_empty())
    });
    PageMetadata {
        title,
        description: meta(&["description", "og:description", "twitter:description"]),
        preview_image_url: meta(&["og:image", "og:image:url", "twitter:image"])
            .map(|image| resolve_url(base_url, &image)),
        favicon_url: favicon(html, base_url),
    }
}

type Attrs = std::collections::HashMap<String, String>;

/// Every `<name ...>` tag's attributes, lowercased names. Handles double, single
/// and unquoted values (minified pages drop the quotes) in any order.
fn tags<'a>(html: &'a str, name: &str) -> impl Iterator<Item = Attrs> + 'a {
    static ATTR: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(
            r#"([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?"#,
        )
        .unwrap()
    });
    let tag = Regex::new(&format!(r"(?is)<{name}\b([^>]*)>")).expect("valid tag pattern");
    tag.captures_iter(html)
        .map(|c| {
            ATTR.captures_iter(&c[1])
                .map(|a| {
                    let value = a
                        .get(2)
                        .or(a.get(3))
                        .or(a.get(4))
                        .map_or("", |m| m.as_str());
                    (a[1].to_ascii_lowercase(), value.to_string())
                })
                .collect::<Attrs>()
        })
        .collect::<Vec<_>>()
        .into_iter()
}

/// The page's icon, preferring a real icon near the 32 px it's shown at, then
/// Apple touch icons, then `/favicon.ico` as a last guess.
fn favicon(html: &str, base_url: &str) -> Option<String> {
    let best = tags(html, "link")
        .filter_map(|attrs| {
            let rel = attrs.get("rel")?.to_ascii_lowercase();
            let href = attrs.get("href").filter(|h| !h.is_empty())?;
            let kind = if rel.split_whitespace().any(|r| r == "icon") {
                0
            } else if rel.starts_with("apple-touch-icon") {
                1
            } else {
                return None;
            };
            // Distance from 32 px; unknown sizes rank like a 64 px icon.
            let size = attrs
                .get("sizes")
                .and_then(|s| s.split(['x', 'X']).next()?.parse::<i32>().ok())
                .map_or(32, |px| (px - 32).abs());
            Some(((kind, size), href.clone()))
        })
        .min_by_key(|(rank, _)| *rank);
    match best {
        Some((_, href)) => Some(resolve_url(base_url, &href)),
        None => {
            let parsed = url::Url::parse(base_url).ok()?;
            Some(format!(
                "{}://{}/favicon.ico",
                parsed.scheme(),
                parsed.host_str()?
            ))
        }
    }
}

fn resolve_url(base: &str, maybe_relative: &str) -> String {
    url::Url::parse(base)
        .and_then(|b| b.join(maybe_relative))
        .map(|u| u.to_string())
        .unwrap_or_else(|_| maybe_relative.to_string())
}

/// The named entities pages commonly use in titles and descriptions, plus any
/// numeric one (`&#8217;`, `&#x2019;`).
fn html_unescape(s: &str) -> String {
    static ENTITY: std::sync::LazyLock<Regex> = std::sync::LazyLock::new(|| {
        Regex::new(r"&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);").unwrap()
    });
    ENTITY
        .replace_all(s, |c: &regex::Captures| {
            let entity = &c[1];
            let decoded = if let Some(hex) = entity
                .strip_prefix("#x")
                .or_else(|| entity.strip_prefix("#X"))
            {
                u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
            } else if let Some(dec) = entity.strip_prefix('#') {
                dec.parse::<u32>().ok().and_then(char::from_u32)
            } else {
                match entity {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    "nbsp" => Some(' '),
                    "rsquo" => Some('\u{2019}'),
                    "lsquo" => Some('\u{2018}'),
                    "rdquo" => Some('\u{201d}'),
                    "ldquo" => Some('\u{201c}'),
                    "ndash" => Some('\u{2013}'),
                    "mdash" => Some('\u{2014}'),
                    "hellip" => Some('\u{2026}'),
                    _ => None,
                }
            };
            decoded.map_or_else(|| c[0].to_string(), String::from)
        })
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_minified_unquoted_markup() {
        let html = r#"<head><title>Deployments | Kubernetes</title>
            <meta property=og:image content=/images/kubernetes-open-graph.png>
            <meta name="description" content="A Deployment manages Pods, one that doesn't keep state.">
            <link rel="shortcut icon" type=image/png href=/images/kubernetes.png>
            <link rel=icon type=image/png sizes=64x64 href=/icons/favicon-64.png>
            <link rel=icon type=image/png sizes=32x32 href=/icons/favicon-32.png>
            <link rel=apple-touch-icon-180x180 href=/icons/apple-180.png></head>"#;
        let meta = page_metadata(html, "https://kubernetes.io/docs/deployment/");
        assert_eq!(meta.title.as_deref(), Some("Deployments | Kubernetes"));
        assert_eq!(
            meta.description.as_deref(),
            Some("A Deployment manages Pods, one that doesn't keep state.")
        );
        assert_eq!(
            meta.preview_image_url.as_deref(),
            Some("https://kubernetes.io/images/kubernetes-open-graph.png")
        );
        assert_eq!(
            meta.favicon_url.as_deref(),
            Some("https://kubernetes.io/icons/favicon-32.png")
        );
    }

    #[test]
    fn content_before_property_and_entities() {
        let html = r#"<meta content='It&#8217;s &amp; more' property="og:description">
            <meta content="https://cdn.x.dev/card.png" property="og:image">"#;
        let meta = page_metadata(html, "https://x.dev/");
        assert_eq!(meta.description.as_deref(), Some("It\u{2019}s & more"));
        assert_eq!(
            meta.preview_image_url.as_deref(),
            Some("https://cdn.x.dev/card.png")
        );
        assert_eq!(
            meta.favicon_url.as_deref(),
            Some("https://x.dev/favicon.ico")
        );
    }
}
