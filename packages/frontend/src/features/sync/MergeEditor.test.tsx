import type { ConflictView } from "@nookly/shared/sync";
import { act, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { MergeEditor } from "./MergeEditor.tsx";
import { useAccountDialog } from "./account-dialog-store.ts";
import { syncRuntime } from "./sync-instance.ts";

const AT = new Date("2026-10-14T14:02:00");

const TITLE: ConflictView = {
  id: "c1",
  source: "device",
  kind: "field",
  table: "entities",
  pk: "t1",
  field: "title",
  itemId: "t1",
  itemTitle: "Buy milk and eggs",
  fieldLabel: "Title",
  current: "Buy milk and eggs",
  other: "Buy oat milk",
  currentSide: { device: "iPhone", isThisDevice: true, at: AT },
  otherSide: { device: "MacBook", isThisDevice: false, at: new Date("2026-10-14T14:01:00") },
  isText: true,
  createdAt: "2026-10-14T14:03:00Z",
};
const EFFORT: ConflictView = {
  ...TITLE,
  id: "c2",
  table: "tasks",
  field: "effort",
  fieldLabel: "Effort",
  current: 5,
  other: 3,
  isText: false,
};
const REMOVED: ConflictView = {
  ...TITLE,
  id: "c3",
  kind: "removed",
  field: null,
  fieldLabel: "Removed item",
  current: null,
  other: '{"title":"Old"}',
  isText: false,
};

function show(views: ConflictView[]) {
  vi.spyOn(syncRuntime, "conflictViews").mockResolvedValue(views);
  const rendered = renderWithProviders(<MergeEditor />);
  act(() => useAccountDialog.getState().setMergeOpen(true));
  return rendered;
}

afterEach(() => {
  vi.restoreAllMocks();
  act(() => useAccountDialog.getState().setMergeOpen(false));
});

describe("the merge editor", () => {
  it("shows both versions side by side with the devices and times, and no version control words", async () => {
    show([TITLE]);
    const dialog = await screen.findByRole("dialog", { name: "Changes that need a look" });
    expect(await within(dialog).findByText("iPhone")).toBeInTheDocument();
    expect(within(dialog).getByText("This device")).toBeInTheDocument();
    expect(within(dialog).getByText("MacBook")).toBeInTheDocument();
    expect(within(dialog).getByText("Showing now")).toBeInTheDocument();
    // The words that differ are marked.
    const mine = within(screen.getByRole("region", { name: "iPhone's version" }));
    const theirs = within(screen.getByRole("region", { name: "MacBook's version" }));
    expect(theirs.getByText("oat")).toHaveAttribute("data-changed", "true");
    expect(mine.getByText(/and eggs/)).toHaveAttribute("data-changed", "true");
    expect(dialog.textContent).not.toMatch(/\b(ours|theirs|HEAD|rebase|merge conflict)\b/i);
    await expectNoA11yViolations();
  });

  it("keeps this one, which is what already shows", async () => {
    const resolve = vi.spyOn(syncRuntime, "resolveConflict").mockResolvedValue();
    const { user } = show([TITLE]);
    await user.click(await screen.findByRole("button", { name: "Keep This One" }));
    expect(resolve).toHaveBeenCalledWith(TITLE, "current");
  });

  it("keeps the other one", async () => {
    const resolve = vi.spyOn(syncRuntime, "resolveConflict").mockResolvedValue();
    const { user } = show([TITLE]);
    await user.click(await screen.findByRole("button", { name: "Keep the Other" }));
    expect(resolve).toHaveBeenCalledWith(TITLE, "other");
  });

  it("keeps both: opens them combined to edit, and saves what is written", async () => {
    const resolve = vi.spyOn(syncRuntime, "resolveConflict").mockResolvedValue();
    const { user } = show([TITLE]);
    await user.click(await screen.findByRole("button", { name: "Keep Both" }));
    const box = screen.getByRole("textbox", { name: "Combined version" });
    expect(box).toHaveValue("Buy milk and eggs / Buy oat milk");
    await user.clear(box);
    await user.type(box, "Buy oat milk and eggs");
    await expectNoA11yViolations();
    await user.click(screen.getByRole("button", { name: "Save Combined" }));
    expect(resolve).toHaveBeenCalledWith(TITLE, { value: "Buy oat milk and eggs" });
  });

  it("offers editing the combined version without keeping both first", async () => {
    const { user } = show([TITLE]);
    await user.click(await screen.findByRole("button", { name: "Edit Combined Version" }));
    expect(screen.getByRole("textbox", { name: "Combined version" })).toHaveValue(
      "Buy milk and eggs / Buy oat milk",
    );
  });

  it("only offers the two choices for a value that isn't text", async () => {
    show([EFFORT]);
    await screen.findByRole("button", { name: "Keep This One" });
    expect(screen.queryByRole("button", { name: "Keep Both" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Combined Version" })).not.toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("brings back something removed on one device and edited on the other", async () => {
    const resolve = vi.spyOn(syncRuntime, "resolveConflict").mockResolvedValue();
    const { user } = show([REMOVED]);
    expect(await screen.findByText(/removed on one device/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bring It Back" }));
    expect(resolve).toHaveBeenCalledWith(REMOVED, "other");
  });

  it("lists every conflict and moves to the next after one is decided", async () => {
    vi.spyOn(syncRuntime, "resolveConflict").mockResolvedValue();
    const spy = vi.spyOn(syncRuntime, "conflictViews");
    spy.mockResolvedValueOnce([TITLE, EFFORT]).mockResolvedValue([EFFORT]);
    const rendered = renderWithProviders(<MergeEditor />);
    act(() => useAccountDialog.getState().setMergeOpen(true));
    const list = await screen.findByRole("list", { name: "Conflicts" });
    expect(await within(list).findAllByRole("listitem")).toHaveLength(2);
    await rendered.user.click(screen.getByRole("button", { name: "Keep This One" }));
    expect(await screen.findByText("Effort")).toBeInTheDocument();
  });

  it("says when nothing needs a look", async () => {
    show([]);
    expect(await screen.findByText("Nothing needs a look.")).toBeInTheDocument();
  });
});
