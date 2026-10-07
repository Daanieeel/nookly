import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { settings } from "#/lib/settings/settings.ts";
import { HOUR_PX, buildColumns, type SlotRange } from "./calendar-model.ts";
import { TimeGrid } from "./TimeGrid.tsx";

const DAY = new Date(2026, 2, 11);

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 100, 24 * HOUR_PX),
  );
  HTMLElement.prototype.setPointerCapture = () => {};
});

function setup(kind?: "session" | "calendarEntry") {
  const onSelect = vi.fn<(range: SlotRange) => void>();
  const view = render(
    <TimeGrid
      columns={buildColumns([DAY], [], [])}
      selection={null}
      highlightIds={new Set()}
      onSelect={onSelect}
      onPickDay={() => {}}
      createKind={kind}
    />,
  );
  const column = view.container.querySelector<HTMLElement>("[data-day-column]");
  if (!column) throw new Error("no day column");
  return { onSelect, column, view };
}

/// A press and release at `fromY`, dragged to `toY` when given (pixels).
function gesture(column: HTMLElement, fromY: number, toY = fromY) {
  fireEvent.pointerDown(column, { button: 0, pointerId: 1, clientX: 10, clientY: fromY });
  if (toY !== fromY) fireEvent.pointerMove(column, { pointerId: 1, clientX: 10, clientY: toY });
  fireEvent.pointerUp(column, { pointerId: 1, clientX: 10, clientY: toY });
}

describe("TimeGrid creating", () => {
  it("proposes the calendar entry length on a click by default", () => {
    const { onSelect, column } = setup();
    gesture(column, 10 * HOUR_PX);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ startMin: 600, endMin: 660 }));
  });

  it("proposes the session length for sessions, following the setting", () => {
    const { onSelect, column } = setup("session");
    gesture(column, 10 * HOUR_PX);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ startMin: 600, endMin: 690 }),
    );
    settings.set("calendar.sessionLengthMinutes", 25);
    gesture(column, 10 * HOUR_PX);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ startMin: 600, endMin: 625 }),
    );
  });

  it("lets a dragged range win over the default length", () => {
    const { onSelect, column } = setup("session");
    gesture(column, 10 * HOUR_PX, 11 * HOUR_PX);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ startMin: 600, endMin: 675 }));
  });

  it("snaps a dragged range to the snap setting", () => {
    settings.set("calendar.snapMinutes", 30);
    const { onSelect, column } = setup("session");
    // 650 minutes floors to 10:30 on a 30 minute grid, and the range includes that step.
    gesture(column, 10 * HOUR_PX, 10 * HOUR_PX + 40);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ startMin: 600, endMin: 660 }));
  });

  it("opens scrolled to the first hour setting", () => {
    settings.set("calendar.dayStartHour", 9);
    const { view } = setup();
    expect(view.container.firstElementChild?.scrollTop).toBe(9 * HOUR_PX);
  });
});
