import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeBlock } from "#/test/fixtures.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { installTauriMock, mockCommand, uninstallTauriMock } from "#/test/tauri.ts";
import { BlockEditor } from "./BlockEditor";

beforeEach(() => {
  // jsdom has no layout; the block handles probe the point under the pointer.
  document.elementFromPoint = () => null;
  installTauriMock();
  mockCommand("list_blocks", [
    makeBlock({ id: "b1", position: 0, content: "Alpha beta alpha" }),
    makeBlock({ id: "b2", position: 1, content: "ALPHA" }),
  ]);
});
afterEach(() => {
  Reflect.deleteProperty(document, "elementFromPoint");
  uninstallTauriMock();
});

async function renderPage(props: { compact?: boolean } = {}) {
  const view = renderWithProviders(<BlockEditor entityId="e1" spaceId="s1" {...props} />);
  await waitFor(() => expect(view.container.querySelector(".tiptap-content")).not.toBeNull());
  return view;
}

const findField = () => screen.getByRole("textbox", { name: "Find" });
const matches = (container: HTMLElement) => container.querySelectorAll(".find-match");

describe("find in page", () => {
  it("opens with Cmd+F and takes the focus", async () => {
    const { user } = await renderPage();
    expect(screen.queryByRole("search", { name: "Find in page" })).toBeNull();
    await user.keyboard("{Control>}f{/Control}");
    expect(screen.getByRole("search", { name: "Find in page" })).toBeInTheDocument();
    expect(findField()).toHaveFocus();
  });

  it("is not offered in an editor embedded in another page", async () => {
    const { user } = await renderPage({ compact: true });
    await user.keyboard("{Control>}f{/Control}");
    expect(screen.queryByRole("search")).toBeNull();
  });

  it("counts and marks the matches, and steps through them with Enter", async () => {
    const { user, container } = await renderPage();
    await user.keyboard("{Control>}f{/Control}");
    await user.type(findField(), "alpha");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3");
    expect(matches(container)).toHaveLength(3);
    expect(container.querySelectorAll(".find-match-current")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("2 of 3");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3");
    await user.click(screen.getByRole("button", { name: "Previous Match" }));
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3");
  });

  it("says when nothing matches or the expression is invalid", async () => {
    const { user } = await renderPage();
    await user.keyboard("{Control>}f{/Control}");
    await user.type(findField(), "zzz");
    expect(screen.getByRole("status")).toHaveTextContent("No results");
    await user.clear(findField());
    await user.click(screen.getByRole("button", { name: "Use Regular Expression" }));
    await user.type(findField(), "[[a");
    expect(screen.getByRole("status")).toHaveTextContent("Invalid expression");
    expect(findField()).toHaveAttribute("aria-invalid", "true");
  });

  it("matches case and whole words from the toggles", async () => {
    const { user } = await renderPage();
    await user.keyboard("{Control>}f{/Control}");
    await user.type(findField(), "alp");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 3");
    await user.click(screen.getByRole("button", { name: "Match Case" }));
    expect(screen.getByRole("button", { name: "Match Case" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 of 1");
    await user.click(screen.getByRole("button", { name: "Match Whole Word" }));
    expect(screen.getByRole("status")).toHaveTextContent("No results");
  });

  it("closes with Escape and clears the marks", async () => {
    const { user, container } = await renderPage();
    await user.keyboard("{Control>}f{/Control}");
    await user.type(findField(), "alpha");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("search")).toBeNull();
    expect(matches(container)).toHaveLength(0);
  });

  it("replaces one match, then all", async () => {
    const { user, container } = await renderPage();
    await user.keyboard("{Control>}f{/Control}");
    await user.type(findField(), "alpha");
    expect(screen.queryByRole("textbox", { name: "Replace With" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show Replace" }));
    await user.type(screen.getByRole("textbox", { name: "Replace With" }), "omega");
    await user.click(screen.getByRole("button", { name: "Replace Match" }));
    expect(container.querySelector(".tiptap-content")?.textContent).toContain("omega beta alpha");
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2");
    await user.click(screen.getByRole("button", { name: "Replace All" }));
    expect(container.querySelector(".tiptap-content")?.textContent).toBe("omega beta omegaomega");
    expect(screen.getByRole("status")).toHaveTextContent("No results");
  });

  it("selects every occurrence with the button", async () => {
    const { user, container } = await renderPage();
    await user.keyboard("{Control>}f{/Control}");
    await user.type(findField(), "alpha");
    await user.click(screen.getByRole("button", { name: "Select All Occurrences" }));
    expect(container.querySelectorAll(".find-multi")).toHaveLength(3);
  });

  it("has no axe violations, with replace open", async () => {
    const { user } = await renderPage();
    await user.keyboard("{Control>}f{/Control}");
    await user.click(screen.getByRole("button", { name: "Show Replace" }));
    await expectNoA11yViolations(screen.getByRole("search"));
  });

  // jsdom has no layout, so these pin the classes that keep the bar's fields in line.
  describe("the look of the bar", () => {
    async function openWithReplace() {
      const { user } = await renderPage();
      await user.keyboard("{Control>}f{/Control}");
      await user.click(screen.getByRole("button", { name: "Show Replace" }));
      return screen.getByRole("search");
    }

    it("lines both fields up in one column, so they are the same width", async () => {
      const bar = await openWithReplace();
      const replace = screen.getByRole("textbox", { name: "Replace With" });
      expect(findField().parentElement?.parentElement).toBe(replace.parentElement);
      expect(replace.parentElement).toBe(bar);
      expect(bar.className).toMatch(/\bgrid\b/);
    });

    it("gives both fields the default input background, not the page's", async () => {
      await openWithReplace();
      const replace = screen.getByRole("textbox", { name: "Replace With" });
      for (const field of [findField().parentElement, replace]) {
        expect(field?.className).toMatch(/\bbg-accent\b/);
        expect(field?.className).not.toMatch(/\bbg-background\b/);
      }
    });

    it("keeps the chevron beside the first field when replace opens", async () => {
      await openWithReplace();
      const chevron = screen.getByRole("button", { name: "Hide Replace" });
      expect(chevron.className).not.toMatch(/self-stretch|h-auto/);
      expect(chevron.className).toMatch(/\bh-8\b/);
    });

    it("sizes the toggles to sit inside the field with a small radius", async () => {
      const { user } = await renderPage();
      await user.keyboard("{Control>}f{/Control}");
      const toggle = screen.getByRole("button", { name: "Match Case" });
      expect(toggle.className).toMatch(/\bsize-6\.5\b/);
      expect(toggle.className).toMatch(/rounded-inset/);
      expect(toggle.className).not.toMatch(/\brounded-sm\b/);
    });

    it("leaves a 2px gap between the toggles", async () => {
      const { user } = await renderPage();
      await user.keyboard("{Control>}f{/Control}");
      const row = screen.getByRole("button", { name: "Match Case" }).parentElement;
      expect(row).toBe(
        screen.getByRole("button", { name: "Use Regular Expression" }).parentElement,
      );
      expect(row?.className).toMatch(/\bgap-0\.5\b/);
    });
  });

  it("closes from its close button", async () => {
    const { user } = await renderPage();
    await user.keyboard("{Control>}f{/Control}");
    const bar = screen.getByRole("search");
    fireEvent.click(within(bar).getByRole("button", { name: "Close Find" }));
    expect(screen.queryByRole("search")).toBeNull();
  });
});
