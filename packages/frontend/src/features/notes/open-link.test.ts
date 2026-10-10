import { describe, expect, it } from "vitest";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { openExternalLink } from "./open-link.ts";

/// A click on a link, as ProseMirror hands it to `handleClickOn`.
function click(href: string | null, modifiers: MouseEventInit = {}): MouseEvent {
  const link = document.createElement("a");
  if (href !== null) link.setAttribute("href", href);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...modifiers });
  Object.defineProperty(event, "target", { value: link });
  return event;
}

describe("openExternalLink", () => {
  it.each(["https://example.com/a", "http://example.com", "mailto:me@example.com"])(
    "opens %s on Cmd or Ctrl click",
    async (href) => {
      mockCommand("plugin:opener|open_url", null);
      for (const modifier of [{ metaKey: true }, { ctrlKey: true }]) {
        const event = click(href, modifier);
        expect(openExternalLink(event)).toBe(true);
        expect(event.defaultPrevented).toBe(true);
      }
      await Promise.resolve();
      expect(callsOf("plugin:opener|open_url")).toHaveLength(2);
      expect(callsOf("plugin:opener|open_url")[0]).toMatchObject({ url: href });
    },
  );

  it("leaves a plain click alone, so the caret still lands in the text", () => {
    mockCommand("plugin:opener|open_url", null);
    const event = click("https://example.com");
    expect(openExternalLink(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(callsOf("plugin:opener|open_url")).toHaveLength(0);
  });

  it("never opens a link that is not a web or mail address", () => {
    mockCommand("plugin:opener|open_url", null);
    for (const href of ["file:///etc/passwd", "javascript:alert(1)", "mention:abc", "#top", "x"]) {
      expect(openExternalLink(click(href, { metaKey: true }))).toBe(false);
    }
    expect(callsOf("plugin:opener|open_url")).toHaveLength(0);
  });

  it("ignores clicks that are not on a link", () => {
    const event = new MouseEvent("click", { metaKey: true });
    Object.defineProperty(event, "target", { value: document.createElement("p") });
    expect(openExternalLink(event)).toBe(false);
    expect(openExternalLink(click(null, { metaKey: true }))).toBe(false);
  });
});
