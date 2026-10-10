import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CHANGELOG_URL } from "#/lib/changelog.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand } from "#/test/tauri.ts";
import { WhatsNewDialog } from "./WhatsNewDialog.tsx";

const TEXT = `# Changelog

## 0.31.10 (2026-10-10)

### Added

- Share a page from its sidebar

### Fixed

- Tables scroll sideways

## 0.30.2 (2026-09-01)

### Changed

- An older change nobody needs to see
`;

function open(version: string, text = TEXT) {
  mockCommand("plugin:app|version", version);
  mockCommand("plugin:opener|open_url", null);
  const view = renderWithProviders(<WhatsNewDialog text={text} />);
  act(() => useNavStore.getState().setWhatsNewOpen(true));
  return view;
}

beforeEach(() => {
  useNavStore.setState({ whatsNewOpen: false });
});

describe("WhatsNewDialog", () => {
  it("shows the notes of the version that is running, with its date", async () => {
    open("0.31.10");
    expect(await screen.findByRole("dialog", { name: /What.s new in 0\.31\.10/ })).toBeTruthy();
    expect(await screen.findByText("Share a page from its sidebar")).toBeTruthy();
    expect(screen.getByText("Tables scroll sideways")).toBeTruthy();
    expect(screen.getByText("Added")).toBeTruthy();
    expect(screen.getByText("Fixed")).toBeTruthy();
    expect(screen.getByText(/October 10, 2026|Oct 10, 2026|2026/)).toBeTruthy();
  });

  it("shows only the current version, never an older one", async () => {
    open("0.31.10");
    await screen.findByText("Share a page from its sidebar");
    expect(screen.queryByText("An older change nobody needs to see")).toBeNull();
    expect(screen.queryByText(/0\.30\.2/)).toBeNull();
  });

  it("shows the older version's notes when that is the version running", async () => {
    open("0.30.2");
    expect(await screen.findByText("An older change nobody needs to see")).toBeTruthy();
    expect(screen.queryByText("Share a page from its sidebar")).toBeNull();
  });

  it("opens the full changelog on GitHub", async () => {
    const { user } = open("0.31.10");
    await user.click(await screen.findByRole("button", { name: "See full changelog" }));
    await waitFor(() => expect(callsOf("plugin:opener|open_url")).toHaveLength(1));
    expect(callsOf("plugin:opener|open_url")[0]).toMatchObject({ url: CHANGELOG_URL });
  });

  it("says there are no notes yet for a version without a section, and still links the rest", async () => {
    open("9.9.9");
    expect(await screen.findByText(/no notes for this version/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "See full changelog" })).toBeTruthy();
  });

  it("closes", async () => {
    const { user } = open("0.31.10");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(useNavStore.getState().whatsNewOpen).toBe(false);
  });

  it("has no accessibility violations", async () => {
    open("0.31.10");
    await screen.findByText("Share a page from its sidebar");
    await expectNoA11yViolations();
  });
});
