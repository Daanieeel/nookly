import { type ColumnDef, useTable } from "@tanstack/react-table";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { type DataTableFeatures, dataTableFeatures } from "#/lib/table-features.ts";
import { useListLayout } from "#/test/layout.ts";
import { DataTable, type DataTableGroup } from "./data-table.tsx";

interface Row {
  id: string;
  title: string;
  deadline: string;
}

const columns: ColumnDef<DataTableFeatures, Row>[] = [
  {
    id: "title",
    accessorFn: (row) => row.title,
    header: "Title",
    cell: ({ row }) => <span className="truncate">{row.original.title}</span>,
    meta: { label: "Title", width: "fill" },
  },
  {
    id: "deadline",
    accessorFn: (row) => row.deadline,
    header: "Deadline",
    cell: ({ row }) => row.original.deadline,
    meta: { label: "Deadline", width: "fit" },
  },
  {
    id: "plain",
    accessorFn: (row) => row.id,
    // No meta label: the column id is used.
    header: "Plain header",
    cell: ({ row }) => row.original.id,
  },
];

function Harness() {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: [{ id: "r1", title: "Essay", deadline: "Mon" }],
    getRowId: (row) => row.id,
  });
  return <DataTable table={table} />;
}

const colMin = (el: HTMLElement) => el.style.getPropertyValue("--col-min");

describe("DataTable horizontal scrolling", () => {
  it("scrolls sideways inside a wrapper instead of squeezing columns", () => {
    const { container } = render(<Harness />);
    expect(container.firstElementChild).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("table")).toHaveClass("min-w-max", "w-full");
  });

  it("gives every column a minimum width from its header", () => {
    render(<Harness />);
    expect(colMin(screen.getByRole("columnheader", { name: "Title" }))).toBe("calc(5ch + 3.5rem)");
    expect(colMin(screen.getByRole("columnheader", { name: "Deadline" }))).toBe(
      "calc(8ch + 3.5rem)",
    );
    expect(colMin(screen.getByRole("columnheader", { name: "Plain header" }))).toBe(
      "calc(5ch + 3.5rem)",
    );
  });

  it("applies the same minimum to the cells of a column, fill columns included", () => {
    render(<Harness />);
    const cells = screen.getAllByRole("cell");
    expect(cells.map((cell) => colMin(cell))).toEqual([
      "calc(5ch + 3.5rem)",
      "calc(8ch + 3.5rem)",
      "calc(5ch + 3.5rem)",
    ]);
    expect(cells.every((cell) => cell.classList.contains("min-w-(--col-min)"))).toBe(true);
  });
});

describe("DataTable that does not scroll sideways", () => {
  it("fits the width it has, hiding what does not fit instead of scrolling", () => {
    const Fitting = () => {
      const table = useTable({
        features: dataTableFeatures,
        columns,
        data: [{ id: "r1", title: "Essay", deadline: "Mon" }],
        getRowId: (row) => row.id,
      });
      return <DataTable table={table} scrollX={false} />;
    };
    const { container } = render(<Fitting />);
    expect(container.firstElementChild).toHaveClass("overflow-x-hidden");
    expect(container.firstElementChild).not.toHaveClass("overflow-x-auto");
    expect(screen.getByRole("table")).not.toHaveClass("min-w-max");
  });
});

describe("DataTable with a long list", () => {
  useListLayout({ viewport: 400, row: 37 });

  const many = (count: number): Row[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `r${i}`,
      title: `Essay ${i}`,
      deadline: "Mon",
    }));

  function Long({ data, groups }: { data: Row[]; groups?: DataTableGroup<Row>[] }) {
    const table = useTable({
      features: dataTableFeatures,
      columns,
      data,
      getRowId: (row) => row.id,
    });
    return (
      <div data-scroll-root="" className="h-100 overflow-auto">
        <DataTable table={table} groups={groups} onRowClick={() => {}} />
      </div>
    );
  }

  const drawnRows = () =>
    screen.getAllByRole("row").filter((row) => row.hasAttribute("data-index"));

  it("draws only the rows around the screen, and says how many there are", () => {
    render(<Long data={many(3000)} />);
    expect(drawnRows().length).toBeLessThan(60);
    expect(screen.getByText("Essay 0")).toBeInTheDocument();
    expect(screen.queryByText("Essay 2999")).toBeNull();
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "3001");
    expect(drawnRows()[0]).toHaveAttribute("aria-rowindex", "2");
  });

  it("draws a list below the limit in full, as before", () => {
    render(<Long data={many(120)} />);
    expect(drawnRows()).toHaveLength(0);
    expect(screen.getAllByRole("row")).toHaveLength(121);
    expect(screen.getByRole("table")).not.toHaveAttribute("aria-rowcount");
  });

  it("keeps the header and the group headings among the rows", () => {
    const groups: DataTableGroup<Row>[] = [
      { id: "early", label: "Early", match: (row) => Number(row.id.slice(1)) < 200 },
      { id: "late", label: "Late", match: () => true },
    ];
    render(<Long data={many(400)} groups={groups} />);
    expect(screen.getByRole("columnheader", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("Early")).toBeInTheDocument();
    expect(screen.queryByText("Late")).toBeNull();
    // 400 rows and 2 headings, plus the header row.
    expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "403");
  });

  it("keeps the row that has the focus drawn, whatever the rest does", async () => {
    const user = userEvent.setup();
    render(<Long data={many(3000)} />);
    await user.tab();
    const focused = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(focused).toHaveFocus();
  });
});
