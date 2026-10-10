import { describe, expect, it } from "vitest";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { currentTabs, useNavStore } from "#/lib/store/nav.ts";
import { openExternalLink, openLink } from "./open-link.ts";

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

describe("openLink on a mention", () => {
  it("opens the entity in the current tab on a plain click", () => {
    mockCommand("touch_entity_opened", null);
    const before = currentTabs(useNavStore.getState()).length;
    const event = click("mention:abc123");
    expect(openLink(event, "space1")).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    const state = useNavStore.getState();
    expect(state.view).toMatchObject({ kind: "entity", entityId: "abc123", spaceId: "space1" });
    expect(currentTabs(state)).toHaveLength(before);
  });

  it("opens the entity in a new tab on a Cmd or Ctrl click", () => {
    mockCommand("touch_entity_opened", null);
    const before = currentTabs(useNavStore.getState()).length;
    expect(openLink(click("mention:def456", { metaKey: true }), "space1")).toBe(true);
    expect(currentTabs(useNavStore.getState())).toHaveLength(before + 1);
  });

  it("still opens web links on Cmd click", () => {
    mockCommand("plugin:opener|open_url", null);
    expect(openLink(click("https://example.com", { metaKey: true }), "space1")).toBe(true);
  });
});
