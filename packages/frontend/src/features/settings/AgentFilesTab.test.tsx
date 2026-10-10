import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { AgentFilesTab } from "./AgentFilesTab.tsx";

const FILES = [
  { name: "AGENTS.md", size: 120, modified: "2026-01-01T00:00:00Z" },
  { name: "PROFILE.md", size: 20, modified: "2026-01-02T00:00:00Z" },
];
const CONTENT = new Map([
  ["AGENTS.md", "# Agents"],
  ["PROFILE.md", "I study."],
]);

function setup() {
  mockCommand("agent_dir_path", "/data/agent");
  mockCommand("list_agent_files", FILES);
  mockCommandWith("read_agent_file", (args) =>
    CONTENT.get(String(args && "name" in args && args.name)),
  );
  mockCommand("write_agent_file", null);
  mockCommand("delete_agent_file", null);
  mockCommand("reveal_agent_dir", null);
  return renderWithProviders(<AgentFilesTab />);
}

const editor = () => screen.findByRole("textbox", { name: "File content" });

describe("AgentFilesTab", () => {
  it("shows the folder, its files and the entry file open", async () => {
    setup();
    expect(await screen.findByText("/data/agent")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /PROFILE\.md/ })).toBeTruthy();
    expect(await editor()).toHaveValue("# Agents");
  });

  it("copies the folder path", async () => {
    const { user } = setup();
    await screen.findByText("/data/agent");
    await user.click(screen.getByRole("button", { name: "Copy Folder Path" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("/data/agent"));
  });

  it("reveals the folder", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Reveal Folder" }));
    await waitFor(() => expect(callsOf("reveal_agent_dir")).toHaveLength(1));
  });

  it("saves edits to the open file", async () => {
    const { user } = setup();
    const box = await editor();
    await screen.findByDisplayValue("# Agents");
    await user.clear(box);
    await user.type(box, "new text");
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(callsOf("write_agent_file")).toHaveLength(1));
    expect(callsOf("write_agent_file")[0]).toEqual({ name: "AGENTS.md", content: "new text" });
  });

  it("creates a file and adds the .md ending", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New File" }));
    await user.type(await screen.findByRole("textbox", { name: /Name/ }), "STYLE");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(callsOf("write_agent_file")).toHaveLength(1));
    expect(callsOf("write_agent_file")[0]).toEqual({ name: "STYLE.md", content: "" });
  });

  it("refuses a name that is taken, ignoring case", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New File" }));
    await user.type(await screen.findByRole("textbox", { name: /Name/ }), "profile");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(callsOf("write_agent_file")).toHaveLength(0);
  });

  it("deletes a file only after confirming", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: /PROFILE\.md/ }));
    await user.click(await screen.findByRole("button", { name: "Delete File" }));
    expect(callsOf("delete_agent_file")).toHaveLength(0);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete File" }));
    await waitFor(() => expect(callsOf("delete_agent_file")).toHaveLength(1));
    expect(callsOf("delete_agent_file")[0]).toEqual({ name: "PROFILE.md" });
  });

  it("does not offer to delete the entry file", async () => {
    setup();
    await editor();
    expect(screen.queryByRole("button", { name: "Delete File" })).toBeNull();
  });

  it("asks before switching away from unsaved changes", async () => {
    const { user } = setup();
    await user.type(await editor(), " more");
    await user.click(screen.getByRole("button", { name: /PROFILE\.md/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/will be lost/i)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(await screen.findByDisplayValue("I study.")).toBeTruthy();
    expect(callsOf("write_agent_file")).toHaveLength(0);
  });
});

describe("AgentFilesTab dialogs", () => {
  it("has no axe violations in the new file dialog", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New File" }));
    await screen.findByRole("dialog");
    await expectNoA11yViolations();
  });

  it("has no axe violations in the delete dialog", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: /PROFILE\.md/ }));
    await user.click(await screen.findByRole("button", { name: "Delete File" }));
    await screen.findByRole("alertdialog");
    await expectNoA11yViolations();
  });
});
