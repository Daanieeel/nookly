/**
 * @jest-environment jsdom
 */
import { CARET_CSS, remoteCaret } from "./caret.ts";

/// A page with another person's caret in its first line and in a later one.
function page() {
  const style = document.createElement("style");
  style.textContent = CARET_CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.className = "pm";
  for (const text of ["First line", "Later line"]) {
    const line = document.createElement("p");
    line.append(text, remoteCaret({ name: "Ada on iPhone", color: "#2563eb" }));
    root.append(line);
  }
  document.body.append(root);
  return [...root.querySelectorAll<HTMLElement>(".ProseMirror-yjs-cursor > div")];
}

describe("another person's caret", () => {
  it("names them in their color", () => {
    const [label] = page();
    expect(label.textContent).toBe("Ada on iPhone");
    expect(label.style.background).toBe("rgb(37, 99, 235)");
  });

  it("puts the name under the caret in the first line, where above it would be cut off", () => {
    const [first, later] = page();
    expect(getComputedStyle(first).top).toBe("100%");
    expect(getComputedStyle(later).top).toBe("-1.35em");
  });
});
