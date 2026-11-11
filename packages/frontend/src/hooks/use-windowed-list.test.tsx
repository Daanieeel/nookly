import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useListLayout } from "#/test/layout.ts";
import { SCROLL_ROOT_ATTRIBUTE, useWindowedList, WINDOW_FROM } from "./use-windowed-list.ts";

const ROW = 40;
const VIEWPORT = 400;

useListLayout({ viewport: VIEWPORT, row: ROW });

function List({
  count,
  root = true,
  keepIndex = null,
}: {
  count: number;
  root?: boolean;
  keepIndex?: number | null;
}) {
  const list = useWindowedList({ count, estimateSize: () => ROW, keepIndex });
  const rows = list.windowed
    ? list.items.map((item) => item.index)
    : Array.from({ length: count }, (_, i) => i);
  return (
    <div {...(root ? { [SCROLL_ROOT_ATTRIBUTE]: "" } : {})} className="h-100">
      <ul ref={list.startRef}>
        {list.windowed && <li data-testid="before" data-room={list.before} />}
        {rows.map((index) => (
          <li key={index} data-index={index} ref={list.measureElement}>
            Row {index}
          </li>
        ))}
        {list.windowed && <li data-testid="after" data-room={list.after} />}
      </ul>
    </div>
  );
}

const drawn = () => screen.queryAllByText(/^Row \d+$/).length;

describe("useWindowedList", () => {
  it("draws a short list in full", () => {
    render(<List count={WINDOW_FROM - 1} />);
    expect(drawn()).toBe(WINDOW_FROM - 1);
    expect(screen.queryByTestId("before")).toBeNull();
  });

  it("draws only the rows around the screen of a long list, and leaves room for the rest", () => {
    render(<List count={3000} />);
    const rows = drawn();
    expect(rows).toBeGreaterThan(VIEWPORT / ROW);
    expect(rows).toBeLessThan(60);
    expect(screen.getByText("Row 0")).toBeInTheDocument();
    expect(screen.queryByText("Row 2999")).toBeNull();
    // Together the drawn rows and the room around them are as tall as the whole list.
    const after = Number(screen.getByTestId("after").dataset.room);
    const before = Number(screen.getByTestId("before").dataset.room);
    expect(before + rows * ROW + after).toBe(3000 * ROW);
  });

  it("draws the list in full when no scroll area surrounds it", () => {
    render(<List count={500} root={false} />);
    expect(drawn()).toBe(500);
  });

  it("keeps the row that was asked for, wherever it is", () => {
    render(<List count={3000} keepIndex={2000} />);
    expect(screen.getByText("Row 2000")).toBeInTheDocument();
    expect(screen.getByText("Row 0")).toBeInTheDocument();
  });
});
