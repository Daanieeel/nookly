import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import { AgentFilesTab } from "./AgentFilesTab.tsx";

const FILES = [
  { name: "AGENTS.md", size: 120, modified: "2026-01-01T00:00:00Z" },
  { name: "NOOKLY.md", size: 900, modified: "2026-01-01T00:00:00Z" },
  { name: "PROFILE.md", size: 20, modified: "2026-01-02T00:00:00Z" },
  { name: "Work/style.md", size: 10, modified: "2026-01-02T00:00:00Z" },
];
const FOLDERS = ["Empty", "Work"];
const CONTENT = new Map([
  ["AGENTS.md", "# Agents"],
  ["NOOKLY.md", "# NOOKLY.md"],
  ["PROFILE.md", "I study."],
  ["Work/style.md", "Short."],
]);

function setup() {
  mockCommand("agent_dir_path", "/data/agent");
  mockCommand("list_agent_files", FILES);
  mockCommand("list_agent_folders", FOLDERS);
  mockCommand("create_agent_folder", null);
  mockCommand("delete_agent_folder", null);
  mockCommandWith("read_agent_file", (args) =>
    CONTENT.get(String(args && "name" in args && args.name)),
  );
  mockCommand("write_agent_file", null);
  mockCommand("delete_agent_file", null);
  mockCommand("reveal_agent_dir", null);
  mockCommand("list_ai_apps", []);
  return renderWithProviders(<AgentFilesTab />);
}

const editor = () => screen.findByRole("textbox", { name: "File content" });

describe("AgentFilesTab", () => {
  it("shows the folder, its files and the entry file open", async () => {
    setup();
    expect(await screen.findByTitle("/data/agent")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /PROFILE\.md/ })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /AGENTS\.md/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(await editor()).toHaveValue("# Agents");
  });

  it("lists the files in a vertical explorer beside the text, not tabs above it", async () => {
    setup();
    const nav = await screen.findByRole("navigation", { name: "Agent files" });
    expect(screen.queryByRole("tab")).toBeNull();
    const box = await editor();
    expect(nav.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Each file is its own row, one below the other, with the entry file first and folders ahead of files.
    const names = within(nav)
      .getAllByRole("button")
      .map((b) => b.getAttribute("title"))
      .filter(Boolean);
    expect(names).toEqual(["AGENTS.md", "Empty", "Work", "NOOKLY.md", "PROFILE.md"]);
    // The entry file leads, then folders, then the other files.
  });

  it("opens and closes folders, and opens a file inside one", async () => {
    const { user } = setup();
    expect(screen.queryByRole("button", { name: /style\.md/ })).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Work" }));
    expect(screen.getByRole("button", { name: "Work" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: /style\.md/ }));
    expect(await screen.findByDisplayValue("Short.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Work" }));
    expect(screen.queryByRole("button", { name: /style\.md/ })).toBeNull();
  });

  it("shows an empty folder as empty", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Empty" }));
    expect(screen.getByText("Empty", { selector: "p" })).toBeTruthy();
  });

  it("makes a new file inside the folder that was last opened", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Work" }));
    await user.click(screen.getByRole("button", { name: "New File" }));
    await user.type(await screen.findByRole("textbox", { name: /Name/ }), "tone");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(callsOf("write_agent_file")).toHaveLength(1));
    expect(callsOf("write_agent_file")[0]).toEqual({
      name: "Work/tone.md",
      content: "",
    });
  });

  it("makes a new folder, and refuses one that exists", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New Folder" }));
    const name = await screen.findByRole("textbox", { name: /Name/ });
    await user.type(name, "work");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(callsOf("create_agent_folder")).toHaveLength(0);
    await user.clear(name);
    await user.type(name, "Notes");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(callsOf("create_agent_folder")).toHaveLength(1));
    expect(callsOf("create_agent_folder")[0]).toEqual({ path: "Notes" });
  });

  it("deletes a folder only after confirming", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Delete Folder Empty" }));
    expect(callsOf("delete_agent_folder")).toHaveLength(0);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete Folder" }));
    await waitFor(() => expect(callsOf("delete_agent_folder")).toHaveLength(1));
    expect(callsOf("delete_agent_folder")[0]).toEqual({ path: "Empty" });
  });

  it("shortens a long folder path in the middle, keeping its end and the full path", async () => {
    const long = "/Users/someone/Library/Application Support/com.nookly.app/agent-files";
    mockCommand("agent_dir_path", long);
    mockCommand("list_agent_files", FILES);
    mockCommandWith("read_agent_file", () => "");
    renderWithProviders(<AgentFilesTab />);
    // Read in full by assistive tech, and as the tooltip of the shortened text.
    expect((await screen.findAllByText(long)).length).toBeGreaterThan(0);
    expect(screen.getByTitle(long)).toBeTruthy();
    // The end of the path is a part of its own that never shrinks; the start shrinks.
    const tail = screen.getByText(long.slice(-16));
    expect(tail).toHaveClass("shrink-0");
    expect(screen.getByText(long.slice(0, -16))).toHaveClass("truncate");
  });

  it("copies the folder path", async () => {
    const { user } = setup();
    await screen.findByTitle("/data/agent");
    await user.click(screen.getByRole("button", { name: "Copy Folder Path" }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("/data/agent"));
  });

  it("reveals the folder", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Reveal Folder" }));
    await waitFor(() => expect(callsOf("reveal_agent_dir")).toHaveLength(1));
  });

  it("has no Save button, and saves when the cursor leaves the text", async () => {
    const { user } = setup();
    const box = await editor();
    await screen.findByDisplayValue("# Agents");
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull();
    await user.clear(box);
    await user.type(box, "new text");
    // Typing alone writes nothing.
    expect(callsOf("write_agent_file")).toHaveLength(0);
    await user.tab();
    await waitFor(() => expect(callsOf("write_agent_file")).toHaveLength(1));
    expect(callsOf("write_agent_file")[0]).toEqual({
      name: "AGENTS.md",
      content: "new text",
    });
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("writes nothing when leaving the text without a change", async () => {
    const { user } = setup();
    const box = await editor();
    await screen.findByDisplayValue("# Agents");
    await user.click(box);
    await user.tab();
    expect(callsOf("write_agent_file")).toHaveLength(0);
  });

  it("saves the open file before showing another one", async () => {
    const { user } = setup();
    await screen.findByDisplayValue("# Agents");
    await user.type(await editor(), " more");
    await user.click(screen.getByRole("button", { name: /PROFILE\.md/ }));
    expect(await screen.findByDisplayValue("I study.")).toBeTruthy();
    expect(callsOf("write_agent_file")).toHaveLength(1);
    expect(callsOf("write_agent_file")[0]).toEqual({
      name: "AGENTS.md",
      content: "# Agents more",
    });
  });

  it("saves a change that is still open when the settings close", async () => {
    const { user, unmount } = setup();
    await screen.findByDisplayValue("# Agents");
    await user.type(await editor(), " more");
    unmount();
    await waitFor(() => expect(callsOf("write_agent_file")).toHaveLength(1));
    expect(callsOf("write_agent_file")[0]).toEqual({
      name: "AGENTS.md",
      content: "# Agents more",
    });
  });

  it("says so when a save fails, and keeps the text", async () => {
    mockCommandWith("write_agent_file", () => {
      throw new Error("disk full");
    });
    const { user } = setup();
    mockCommandWith("write_agent_file", () => {
      throw new Error("disk full");
    });
    await screen.findByDisplayValue("# Agents");
    await user.type(await editor(), " more");
    await user.tab();
    expect(await screen.findByText(/Couldn't save/)).toBeTruthy();
    expect(await editor()).toHaveValue("# Agents more");
  });

  it("creates a file and adds the .md ending", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New File" }));
    await user.type(await screen.findByRole("textbox", { name: /Name/ }), "STYLE");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(callsOf("write_agent_file")).toHaveLength(1));
    expect(callsOf("write_agent_file")[0]).toEqual({
      name: "STYLE.md",
      content: "",
    });
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

  it("does not offer to delete the entry file or the Nookly guide", async () => {
    const { user } = setup();
    await editor();
    expect(screen.queryByRole("button", { name: "Delete File" })).toBeNull();
    await user.click(await screen.findByRole("button", { name: /NOOKLY\.md/ }));
    await screen.findByDisplayValue("# NOOKLY.md");
    expect(screen.queryByRole("button", { name: "Delete File" })).toBeNull();
  });

  it("asks what to do when the file cannot be saved and another is opened", async () => {
    const { user } = setup();
    mockCommandWith("write_agent_file", () => {
      throw new Error("disk full");
    });
    await screen.findByDisplayValue("# Agents");
    await user.type(await editor(), " more");
    await user.click(screen.getByRole("button", { name: /PROFILE\.md/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Couldn't save AGENTS\.md/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Discard" }));
    expect(await screen.findByDisplayValue("I study.")).toBeTruthy();
  });
});

describe("AgentFilesTab layout", () => {
  it("gives the text room: tall by default, and never taller than the window", async () => {
    setup();
    const box = await editor();
    expect(box).toHaveClass("h-96");
    expect(box).toHaveClass("max-h-[50vh]");
  });
});

describe("AgentFilesTab dialogs", () => {
  it("has no axe violations in the new file dialog", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "New File" }));
    await screen.findByRole("dialog");
    await expectNoA11yViolations();
  });

  it("has no axe violations with the explorer and the text", async () => {
    setup();
    await editor();
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
