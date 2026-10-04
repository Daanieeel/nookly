import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { BookmarkDisplayMenu } from "#/features/bookmarks/BookmarkDisplayMenu.tsx";
import type { DisplayOptions as BookmarkDisplay } from "#/features/bookmarks/bookmark-model.ts";
import { FileDisplayMenu } from "#/features/files/FileDisplayMenu.tsx";
import type { DisplayOptions as FileDisplay } from "#/features/files/file-model.ts";
import { TaskDisplayMenu } from "#/features/tasks/TaskDisplayMenu.tsx";
import {
  DEFAULT_DISPLAY,
  type DisplayOptions as TaskDisplay,
} from "#/features/tasks/task-model.ts";
import { boardGroupings } from "./display-menu.tsx";

const BOOKMARKS: BookmarkDisplay = {
  layout: "grid",
  grouping: "none",
  ordering: "newest",
  showPreviews: true,
  showDescriptions: true,
};

function Bookmarks({ onChange }: { onChange: (display: BookmarkDisplay) => void }) {
  const [display, setDisplay] = useState(BOOKMARKS);
  return (
    <BookmarkDisplayMenu
      display={display}
      onChange={(next) => {
        setDisplay(next);
        onChange(next);
      }}
    />
  );
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Display" }));
  return { user, panel: await screen.findByRole("dialog") };
}

describe("CardDisplayMenu", () => {
  it("switches between grid and list", async () => {
    const onChange = vi.fn();
    render(<Bookmarks onChange={onChange} />);
    const { user, panel } = await openMenu();
    expect(within(panel).getByRole("button", { name: "Grid" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(panel).getByRole("button", { name: "List" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...BOOKMARKS, layout: "list" });
    expect(within(panel).getByRole("button", { name: "List" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("picks a grouping and an ordering", async () => {
    const onChange = vi.fn();
    render(<Bookmarks onChange={onChange} />);
    const { user, panel } = await openMenu();
    const [grouping, ordering] = within(panel).getAllByRole("combobox");
    expect(grouping).toHaveTextContent("No grouping");
    await user.click(grouping);
    await user.click(await screen.findByRole("option", { name: "Site" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...BOOKMARKS, grouping: "site" });
    await user.click(ordering);
    await user.click(await screen.findByRole("option", { name: "Title" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...BOOKMARKS,
      grouping: "site",
      ordering: "title",
    });
  });

  it("shows the preview switch only on the grid", async () => {
    const onChange = vi.fn();
    render(<Bookmarks onChange={onChange} />);
    const { user, panel } = await openMenu();
    expect(within(panel).getByText("Preview images")).toBeInTheDocument();
    await user.click(within(panel).getAllByRole("switch")[0]);
    expect(onChange).toHaveBeenLastCalledWith({ ...BOOKMARKS, showPreviews: false });
    await user.click(within(panel).getByRole("button", { name: "List" }));
    expect(within(panel).queryByText("Preview images")).not.toBeInTheDocument();
    expect(within(panel).getByText("Descriptions")).toBeInTheDocument();
  });

  it("offers the Files groupings", async () => {
    const onChange = vi.fn();
    const display: FileDisplay = { layout: "grid", grouping: "kind", ordering: "name" };
    render(<FileDisplayMenu display={display} onChange={onChange} />);
    const { user, panel } = await openMenu();
    const [grouping] = within(panel).getAllByRole("combobox");
    expect(grouping).toHaveTextContent("Kind");
    await user.click(grouping);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "No grouping",
      "Kind",
      "Date added",
    ]);
    await user.click(screen.getByRole("option", { name: "Date added" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...display, grouping: "added" });
  });
});

describe("boardGroupings", () => {
  const available = [
    { id: "status", label: "Status" },
    { id: "due", label: "Due" },
    { id: "none", label: "None" },
  ];

  it("lets only a list go without grouping", () => {
    expect(
      boardGroupings(available, { layout: "list", grouping: "status" }).groupings,
    ).toHaveLength(3);
    expect(
      boardGroupings(available, { layout: "board", grouping: "status" }).groupings.map((g) => g.id),
    ).toEqual(["status", "due"]);
  });

  it("never offers the grouping as its own sub-grouping", () => {
    expect(
      boardGroupings(available, { layout: "list", grouping: "due" }).subGroupings.map((g) => g.id),
    ).toEqual(["status", "none"]);
  });
});

describe("TaskDisplayMenu", () => {
  function Tasks({
    initial,
    onChange,
  }: {
    initial: TaskDisplay;
    onChange: (d: TaskDisplay) => void;
  }) {
    const [display, setDisplay] = useState(initial);
    return (
      <TaskDisplayMenu
        display={display}
        onChange={(next) => {
          setDisplay(next);
          onChange(next);
        }}
        columns={[
          { id: "todo", name: "Todo" },
          { id: "done", name: "Done" },
        ]}
      />
    );
  }

  it("gives a board the status grouping when switching from an ungrouped list", async () => {
    const onChange = vi.fn();
    render(
      <Tasks
        initial={{ ...DEFAULT_DISPLAY, layout: "list", grouping: "none" }}
        onChange={onChange}
      />,
    );
    const { user, panel } = await openMenu();
    await user.click(within(panel).getByRole("button", { name: "Board" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ layout: "board", grouping: "status", subGrouping: "none" }),
    );
  });

  it("hides and shows board columns", async () => {
    const onChange = vi.fn();
    render(<Tasks initial={DEFAULT_DISPLAY} onChange={onChange} />);
    const { user, panel } = await openMenu();
    await user.click(within(panel).getByRole("switch", { name: "Show Done column" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hiddenColumns: ["done"] }));
    await user.click(within(panel).getByRole("switch", { name: "Show Done column" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hiddenColumns: [] }));
  });

  it("drops the sub-grouping when the grouping takes its place", async () => {
    const onChange = vi.fn();
    render(
      <Tasks
        initial={{ ...DEFAULT_DISPLAY, layout: "list", grouping: "status", subGrouping: "due" }}
        onChange={onChange}
      />,
    );
    const { user, panel } = await openMenu();
    const [grouping] = within(panel).getAllByRole("combobox");
    await user.click(grouping);
    await user.click(await screen.findByRole("option", { name: "Due date" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ grouping: "due", subGrouping: "none" }),
    );
  });

  it("offers no Status ordering inside status groups", async () => {
    render(<Tasks initial={DEFAULT_DISPLAY} onChange={() => {}} />);
    const { user, panel } = await openMenu();
    const ordering = within(panel)
      .getAllByRole("combobox")
      .find((c) => c.textContent === "Due date");
    if (!ordering) throw new Error("no ordering select");
    await user.click(ordering);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).not.toContain("Status");
  });
});
