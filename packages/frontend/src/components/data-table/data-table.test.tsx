import { type ColumnDef, useTable } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type DataTableFeatures, dataTableFeatures } from "#/lib/table-features.ts";
import { DataTable } from "./data-table.tsx";

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
