import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CHANGELOG_URL } from "#/lib/changelog.ts";
import { displayText } from "#/lib/shortcuts.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { WhatsNewDialog } from "./WhatsNewDialog.tsx";

const CHANGELOG = `# Changelog

## 0.30.2 (2026-09-01)

### Changed

- An older change from the changelog

## 0.20.0 (2026-05-01)

### Added

- Only in the changelog
`;

const NOTES = {
  versions: [
    {
      version: "0.31.10",
      date: "2026-10-10",
      title: "Pages travel now",
      summary: "Bring pages in and send them out.",
      highlights: [
        {
          title: "Import a page",
          description: "Drop in a page and **check it** first.",
          icon: "file-import",
          tag: "New",
          shortcut: "Mod+I",
        },
        { title: "Relate in steps", description: "Type, how, which.", tag: "Improved" },
      ],
      more: {
        Improved: ["Wide tables scroll sideways.", "Paste plain text with `Mod+Shift+V`."],
        Fixed: ["A crash is gone."],
      },
    },
    {
      version: "0.30.2",
      date: "2026-09-01",
      title: "An older release",
      summary: "Nothing to see here.",
      highlights: [{ title: "Older highlight", description: "From before." }],
      more: {},
    },
  ],
};

function open(version: string) {
  mockCommand("plugin:app|version", version);
  mockCommand("plugin:opener|open_url", null);
  const view = renderWithProviders(<WhatsNewDialog notes={NOTES} changelog={CHANGELOG} />);
  act(() => useNavStore.getState().setWhatsNewOpen(true));
  return view;
}

beforeEach(() => {
  useNavStore.setState({ whatsNewOpen: false });
});

describe("WhatsNewDialog", () => {
  it("shows the version that is running with its date, headline and summary", async () => {
    open("0.31.10");
    expect(await screen.findByRole("dialog", { name: /What.s new in 0\.31\.10/ })).toBeTruthy();
    expect(screen.getByText(/2026/)).toBeTruthy();
    expect(await screen.findByText("Pages travel now")).toBeTruthy();
    expect(await screen.findByText("Bring pages in and send them out.")).toBeTruthy();
  });

  it("shows the highlights as cards with a tag and an icon, and the shortcut as keys", async () => {
    open("0.31.10");
    const card = (await screen.findByText("Import a page")).closest("li");
    if (!(card instanceof HTMLElement)) throw new Error("the card is missing");
    expect(within(card).getByText("New")).toBeTruthy();
    expect(card.querySelector("svg")).not.toBeNull();
    // The shortcut is drawn as keys, not as text in a sentence.
    expect(card.querySelectorAll("kbd").length).toBeGreaterThanOrEqual(2);
    expect(
      within(await screen.findByText("Relate in steps").then((t) => t.closest("li")!)).getByText(
        "Improved",
      ),
    ).toBeTruthy();
  });

  it("draws the descriptions with the note renderer, so formatting works", async () => {
    open("0.31.10");
    const bold = await waitFor(() => {
      const found = document.querySelector(".tiptap-content strong");
      if (!found) throw new Error("not drawn yet");
      return found;
    });
    expect(bold).toHaveTextContent("check it");
  });

  it("shows a shortcut written in code the way this system writes it", async () => {
    open("0.31.10");
    const code = await waitFor(() => {
      const found = [...document.querySelectorAll(".tiptap-content code")].find((el) =>
        el.textContent?.includes("V"),
      );
      if (!found) throw new Error("not drawn yet");
      return found;
    });
    expect(code.textContent).toBe(displayText("Mod+Shift+V"));
  });

  it("lists the smaller changes under their headings", async () => {
    open("0.31.10");
    expect(await screen.findByText("Improved", { selector: "h3" })).toBeTruthy();
    expect(screen.getByText("Fixed", { selector: "h3" })).toBeTruthy();
    expect(await screen.findByText("Wide tables scroll sideways.")).toBeTruthy();
    expect(await screen.findByText("A crash is gone.")).toBeTruthy();
  });

  it("shows only the current version, never an older one", async () => {
    open("0.31.10");
    await screen.findByText("Pages travel now");
    expect(screen.queryByText("An older release")).toBeNull();
    expect(screen.queryByText("Older highlight")).toBeNull();
  });

  it("shows the older version's own notes when that is the one running", async () => {
    open("0.30.2");
    expect(await screen.findByText("Older highlight")).toBeTruthy();
    expect(screen.queryByText("Import a page")).toBeNull();
  });

  it("falls back to the changelog for a version that has no highlights written", async () => {
    open("0.20.0");
    expect(await screen.findByText("Only in the changelog")).toBeTruthy();
    expect(screen.queryByText("Pages travel now")).toBeNull();
  });

  it("opens the full changelog on GitHub", async () => {
    const { user } = open("0.31.10");
    await user.click(await screen.findByRole("button", { name: "See full changelog" }));
    await waitFor(() => expect(callsOf("plugin:opener|open_url")).toHaveLength(1));
    expect(callsOf("plugin:opener|open_url")[0]).toMatchObject({ url: CHANGELOG_URL });
  });

  it("says there are no notes yet for a version without any, and still links the rest", async () => {
    open("9.9.9");
    expect(await screen.findByText(/no notes for this version/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "See full changelog" })).toBeTruthy();
  });

  it("has no extra Close button, only the one in the corner", async () => {
    open("0.31.10");
    await screen.findByText("Pages travel now");
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);
  });

  it("is wide", async () => {
    open("0.31.10");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("max-w-2xl");
  });

  it("lists the highlights as compact rows in one column, not as big cards", async () => {
    open("0.31.10");
    const row = (await screen.findByText("Import a page")).closest("li");
    const list = row?.parentElement;
    expect(list?.className).toContain("divide-y");
    expect(list?.className).not.toContain("grid");
    expect(row?.className).not.toMatch(/\bp-[3-9]\b|rounded-xl|border\b/);
    // The title, its tag and its keys share one line.
    const head = (await screen.findByText("Import a page")).parentElement;
    if (!head) throw new Error("the title row is missing");
    expect(within(head).getByText("New")).toBeTruthy();
    expect(head.querySelectorAll("kbd").length).toBeGreaterThanOrEqual(2);
  });

  it("draws the text without the gutter the note editor keeps for its handles", async () => {
    open("0.31.10");
    await screen.findByText("Import a page");
    const content = await waitFor(() => {
      const found = document.querySelector(".tiptap-content");
      if (!found) throw new Error("not drawn yet");
      return found;
    });
    expect(content).toHaveClass("pl-0");
  });

  it("closes with Escape", async () => {
    const { user } = open("0.31.10");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useNavStore.getState().whatsNewOpen).toBe(false);
  });

  it("has no accessibility violations", async () => {
    open("0.31.10");
    await screen.findByText("Import a page");
    await expectNoA11yViolations();
  });
});
