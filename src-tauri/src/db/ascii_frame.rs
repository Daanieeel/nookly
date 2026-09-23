//! Framed ASCII figures for the markdown export of custom blocks.
//!
//! Ported from mdxcn's Knap renderer (`registry/default/graph-knap/frame.ts` and
//! `graphs.ts`, https://github.com/keshav-exe/mdxcn), MIT License,
//! Copyright (c) 2026 Keshav Bagaade. The output matches mdxcn's official fenced
//! ASCII, so an exported page reads the same in a README, GitHub or Linear.

const MIN_INNER: usize = 48;

fn width_of(text: &str) -> usize {
    text.chars().count()
}

pub fn pad_end(text: &str, size: usize) -> String {
    let width = width_of(text);
    if width >= size {
        return text.chars().take(size).collect();
    }
    format!("{text}{}", " ".repeat(size - width))
}

pub fn pad_start(text: &str, size: usize) -> String {
    let width = width_of(text);
    if width >= size {
        return text.chars().skip(width - size).collect();
    }
    format!("{}{text}", " ".repeat(size - width))
}

pub fn col_width<'a>(values: impl IntoIterator<Item = &'a str>) -> usize {
    values.into_iter().map(width_of).max().unwrap_or(0)
}

/// Greedy word wrap; a single word longer than `width` stays on its own line.
pub fn wrap_text(text: &str, width: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
        } else if width_of(&current) + 1 + width_of(word) > width {
            lines.push(std::mem::take(&mut current));
            current.push_str(word);
        } else {
            current.push(' ');
            current.push_str(word);
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

/// The dashed frame with `+` corners and an optional centered `[ TITLE ]`.
pub fn frame(title: Option<&str>, lines: &[String]) -> String {
    let caption = title
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| format!("[ {} ]", t.to_uppercase()));
    let content_width = col_width(lines.iter().map(String::as_str));
    let caption_width = caption.as_deref().map_or(0, |c| width_of(c) + 4);
    let inner = MIN_INNER.max(content_width).max(caption_width);
    let span = inner + 2;

    let top = match &caption {
        Some(caption) => {
            let label = format!(" {caption} ");
            let leftover = span.saturating_sub(width_of(&label));
            let left = leftover / 2;
            format!(
                "+{}{label}{}+",
                "-".repeat(left),
                "-".repeat(leftover - left)
            )
        }
        None => format!("+{}+", "-".repeat(span)),
    };
    let empty = format!("| {} |", " ".repeat(inner));
    let mut out = vec![top, empty.clone()];
    out.extend(
        lines
            .iter()
            .map(|line| format!("| {} |", pad_end(line, inner))),
    );
    out.push(empty);
    out.push(format!("+{}+", "-".repeat(span)));
    out.join("\n")
}

pub fn fence(ascii: &str) -> String {
    format!("```\n{ascii}\n```")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_centers_the_title_and_pads_every_line() {
        let ascii = frame(Some("shipped"), &["●  Mar 12  CLI copies the files".into()]);
        let lines: Vec<&str> = ascii.lines().collect();
        assert_eq!(
            lines[0],
            "+------------------ [ SHIPPED ] -------------------+"
        );
        assert_eq!(
            lines[2],
            "| ●  Mar 12  CLI copies the files                  |"
        );
        assert!(lines.iter().all(|l| width_of(l) == width_of(lines[0])));
    }

    #[test]
    fn wrap_text_breaks_on_word_boundaries() {
        let long = "word ".repeat(20);
        let lines = wrap_text(&long, 56);
        assert!(lines.len() > 1);
        assert!(lines.iter().all(|l| width_of(l) <= 56));
    }
}
