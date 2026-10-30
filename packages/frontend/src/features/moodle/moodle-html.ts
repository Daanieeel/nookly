import DOMPurify from "dompurify";

/// Moodle writes its descriptions, announcements and posts as HTML, which anybody in a course
/// can author, so it is cleaned before it is shown: no scripts, styles, forms, frames or
/// event handlers. Images are replaced by their description, because Moodle's images need
/// the sign in to load; the page on Moodle shows them.
const purify = DOMPurify(window);

purify.addHook("beforeSanitizeElements", (node) => {
  if (node instanceof HTMLImageElement) {
    const alt = node.getAttribute("alt")?.trim();
    node.replaceWith(document.createTextNode(alt ? `[${alt}]` : ""));
  }
});

purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  }
});

export function cleanMoodleHtml(html: string): string {
  return purify.sanitize(html.replaceAll("@@PLUGINFILE@@", ""), {
    ALLOWED_TAGS: [
      "a",
      "b",
      "blockquote",
      "br",
      "code",
      "dd",
      "div",
      "dl",
      "dt",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "i",
      "li",
      "ol",
      "p",
      "pre",
      "s",
      "span",
      "strike",
      "strong",
      "sub",
      "sup",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "tr",
      "u",
      "ul",
    ],
    ALLOWED_ATTR: ["href", "colspan", "rowspan", "title"],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  });
}

/// Whether the HTML shows anything: Moodle sends `<p><br></p>` for an empty description.
export function hasMoodleText(html: string | null | undefined): boolean {
  if (!html) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return (doc.body.textContent ?? "").trim().length > 0 || doc.body.querySelector("img") !== null;
}
