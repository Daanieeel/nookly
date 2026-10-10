import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildColumns } from "./calendar-model.ts";
import { MonthGrid } from "./MonthGrid.tsx";

afterEach(() => vi.useRealTimers());

// Monday 9 to Sunday 22 March 2026.
const fortnight = Array.from({ length: 14 }, (_, i) => new Date(2026, 2, 9 + i));

function renderGrid() {
  return render(
    <MonthGrid
      anchor={new Date(2026, 2, 11)}
      columns={buildColumns(fortnight, [], [])}
      highlightIds={new Set()}
      onSelect={() => {}}
      onPickDay={() => {}}
      createKind="session"
    />,
  );
}

const header = (view: ReturnType<typeof render>) =>
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => view.getAllByText(name)[0]);

describe("MonthGrid weekday names", () => {
  it("highlights the weekday of today when today is in the range", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 11, 10, 0));
    const view = renderGrid();
    expect(header(view).map((el) => el?.className.includes("text-primary"))).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("highlights none when today is outside the range", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 3, 10, 0));
    const view = renderGrid();
    expect(header(view).some((el) => el?.className.includes("text-primary"))).toBe(false);
  });
});
