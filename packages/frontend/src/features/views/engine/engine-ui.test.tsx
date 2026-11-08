import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#/test/axe.ts";
import {
  makeAssignment,
  makeEntity,
  makeExam,
  makeSpace,
  makeTask,
  STATUSES,
} from "#/test/fixtures.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { mockCommand } from "#/test/tauri.ts";
import { AddConditionButton, ConditionChips, type ConditionFieldInfo } from "./ConditionBar.tsx";
import { DEFAULT_ENTITY_VIEW, EntityView } from "./EntityView.tsx";
import { taskContext, taskSource } from "./sources/tasks.tsx";
import { DEFAULT_TABLE } from "./table-display.ts";
import type { TableDisplay, ViewCondition } from "./types.ts";
import { ViewTable } from "./ViewTable.tsx";

const ctx = taskContext({
  statuses: STATUSES,
  labels: [],
  courses: [],
  spaces: [],
  effortScale: "fibonacci",
});

const tasks = [
  makeTask({ dueDate: "2026-03-01" }, { id: "b", title: "Bravo", key: "TSK-2" }),
  makeTask({ dueDate: "2026-01-01" }, { id: "a", title: "Alpha", key: "TSK-1" }),
];

function TableHarness({ onChange }: { onChange?: (table: TableDisplay) => void }) {
  const [table, setTable] = useState<TableDisplay>(DEFAULT_TABLE);
  return (
    <ViewTable
      source={taskSource}
      items={tasks}
      ctx={ctx}
      table={table}
      onTableChange={(next) => {
        setTable(next);
        onChange?.(next);
      }}
      onOpen={() => {}}
    />
  );
}

const titles = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent);

describe("table layout", () => {
  it("shows the default columns of its source", () => {
    renderWithProviders(<TableHarness />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["ID", "Title", "Status", "Labels", "Due date", "Effort"]);
  });

  it("sorts by a column from its header and remembers it", async () => {
    const changes: TableDisplay[] = [];
    const { user } = renderWithProviders(<TableHarness onChange={(t) => changes.push(t)} />);
    expect(titles()).toEqual(["Bravo", "Alpha"]);
    await user.click(screen.getByRole("button", { name: "Sort by Due date" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Ascending" }));
    expect(titles()).toEqual(["Alpha", "Bravo"]);
    expect(changes.at(-1)?.sort).toEqual([{ field: "due", direction: "asc" }]);
  });

  it("resizes a column from the keyboard", async () => {
    const changes: TableDisplay[] = [];
    const { user } = renderWithProviders(<TableHarness onChange={(t) => changes.push(t)} />);
    const handle = screen.getByRole("separator", { name: "Resize Title column" });
    handle.focus();
    // jsdom has no layout, so the first step lands on the smallest width.
    await user.keyboard("{ArrowRight}{ArrowRight}");
    const title = changes.at(-1)?.columns.find((c) => c.field === "title");
    expect(title?.width).toBe(76);
    const header = screen.getByRole("columnheader", { name: /Title/ });
    expect(header.style.getPropertyValue("--col-size")).toBe("76px");
    expect(header).toHaveAttribute("data-sized");
  });

  it("hides a column from its header", async () => {
    const { user } = renderWithProviders(<TableHarness />);
    await user.click(screen.getByRole("button", { name: "Sort by Labels" }));
    await user.click(screen.getByRole("menuitem", { name: "Hide column" }));
    expect(screen.queryByRole("columnheader", { name: /Labels/ })).toBeNull();
  });

  it("has an accessible header menu", async () => {
    const { user, container } = renderWithProviders(<TableHarness />);
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Sort by Title" }));
    await expectNoA11yViolations();
  });
});

const FIELDS: ConditionFieldInfo[] = [
  { id: "due", label: "Due date", kind: "date" },
  { id: "effort", label: "Effort", kind: "number" },
  { id: "title", label: "Title", kind: "text" },
];

function ConditionHarness({ onChange }: { onChange: (c: ViewCondition[]) => void }) {
  const [conditions, setConditions] = useState<ViewCondition[]>([]);
  const set = (next: ViewCondition[]) => {
    setConditions(next);
    onChange(next);
  };
  return (
    <>
      <AddConditionButton fields={FIELDS} onAdd={(c) => set([...conditions, c])} />
      <ConditionChips fields={FIELDS} conditions={conditions} onChange={set} />
    </>
  );
}

describe("conditions bar", () => {
  it("adds a condition by picking a field, then how to compare it", async () => {
    let latest: ViewCondition[] = [];
    const { user } = renderWithProviders(<ConditionHarness onChange={(c) => (latest = c)} />);
    await user.click(screen.getByRole("button", { name: "Add Condition" }));
    await user.click(screen.getByRole("option", { name: "Effort" }));
    await user.click(screen.getByRole("option", { name: "is at least" }));
    expect(latest).toEqual([{ fieldId: "effort", operator: "gte", values: ["0"] }]);

    await user.clear(screen.getByRole("textbox", { name: "Effort is at least" }));
    await user.type(screen.getByRole("textbox", { name: "Effort is at least" }), "5");
    expect(latest).toEqual([{ fieldId: "effort", operator: "gte", values: ["5"] }]);

    await user.click(screen.getByRole("button", { name: "Remove Condition" }));
    expect(latest).toEqual([]);
  });

  it("starts a date range at today and a week on", async () => {
    let latest: ViewCondition[] = [];
    const { user } = renderWithProviders(<ConditionHarness onChange={(c) => (latest = c)} />);
    await user.click(screen.getByRole("button", { name: "Add Condition" }));
    await user.click(screen.getByRole("option", { name: "Due date" }));
    await user.click(screen.getByRole("option", { name: "is between" }));
    expect(latest[0]?.operator).toBe("between");
    expect(latest[0]?.values).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Due date from" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Due date until" })).toBeInTheDocument();
  });

  it("has an accessible menu and chips", async () => {
    const { user, container } = renderWithProviders(<ConditionHarness onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Add Condition" }));
    await expectNoA11yViolations();
    await user.click(screen.getByRole("option", { name: "Title" }));
    await user.click(screen.getByRole("option", { name: "contains" }));
    await expectNoA11yViolations(container);
  });
});

describe("a view inside a page", () => {
  it("shows a Course's Assignments, sorted by due date, with their status", async () => {
    const course = makeEntity({ id: "course", type: "course", title: "Physics", spaceId: "s1" });
    mockCommand("list_assignments", [
      makeAssignment(
        { dueDate: "2026-12-01", status: "submitted" },
        { id: "late", title: "Report" },
      ),
      makeAssignment({ dueDate: "2026-11-10" }, { id: "soon", title: "Sheet 3" }),
      makeAssignment({}, { id: "elsewhere", title: "Other course" }),
    ]);
    mockCommand("list_spaces", [makeSpace({ id: "s1" })]);
    mockCommand("list_courses", [course]);
    const edges = ["late", "soon"].map((id) => ({
      id: `${id}-course`,
      fromEntityId: id,
      toEntityId: "course",
      relationshipType: "assignment-course",
      fromBlockId: null,
      toBlockId: null,
      createdAt: "",
    }));
    mockCommand("list_relationships", edges);

    renderWithProviders(
      <EntityView
        source="assignment"
        spaceId="s1"
        anchorId="course"
        scope={{ relationship: "assignment-course", direction: "outgoing" }}
        config={{
          ...DEFAULT_ENTITY_VIEW,
          display: {
            layout: "table",
            table: {
              sort: [{ field: "due", direction: "asc" }],
              columns: [{ field: "title" }, { field: "status" }, { field: "course" }],
            },
          },
        }}
      />,
    );
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]?.textContent)).toEqual([
      "Sheet 3",
      "Report",
    ]);
    const [, report] = rows;
    if (!report) throw new Error("no second row");
    expect(within(report).getByText("Submitted")).toBeInTheDocument();
    expect(within(report).getByText("Physics")).toBeInTheDocument();
  });

  it("lists any registered type, like Exams", async () => {
    mockCommand("list_exams", [makeExam({}, { id: "e1", title: "Final exam" })]);
    mockCommand("list_spaces", []);
    renderWithProviders(
      <EntityView
        source="exam"
        spaceId="s1"
        config={{ ...DEFAULT_ENTITY_VIEW, display: { layout: "list", table: DEFAULT_TABLE } }}
      />,
    );
    expect(await screen.findByRole("button", { name: /Final exam/ })).toBeInTheDocument();
  });
});
