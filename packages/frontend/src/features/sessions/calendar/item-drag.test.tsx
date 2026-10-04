import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ItemDragMode, type ItemDragRange, useItemDrag } from "./item-drag.ts";

/// A 10:00 to 11:00 block in the middle of three 100 pixel wide day columns.
function Block({
  mode,
  onCommit,
}: {
  mode: ItemDragMode;
  onCommit: (range: ItemDragRange) => void;
}) {
  const { previewRange, handleFor } = useItemDrag({
    startMin: 600,
    endMin: 660,
    dayIndex: 1,
    dayCount: 3,
    onCommit,
  });
  return (
    <div data-day-column>
      <div data-testid="block" {...handleFor(mode)}>
        {previewRange
          ? `${previewRange.startMin}-${previewRange.endMin} day ${previewRange.dayDelta} px ${previewRange.dayDeltaPx}`
          : "idle"}
      </div>
    </div>
  );
}

function setup(mode: ItemDragMode) {
  const onCommit = vi.fn<(range: ItemDragRange) => void>();
  render(<Block mode={mode} onCommit={onCommit} />, {
    onRecoverableError: (error) => {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      if (cause instanceof Error && cause.message.includes("setPointerCapture")) {
        captureErrors.push(cause.message);
      } else {
        throw error;
      }
    },
  });
  const block = screen.getByTestId("block");
  return { block, onCommit };
}

/// Presses at the origin, moves by `dx`, `dy` pixels and releases.
function drag(block: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(block, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(block, { pointerId: 1, clientX: dx, clientY: dy });
  fireEvent.pointerUp(block, { pointerId: 1, clientX: dx, clientY: dy });
}

// Intended: once movement confirms a drag, pointer capture is taken and (for a move) the
// click right after pointerup is swallowed. React reports any error thrown while
// capturing as a recoverable error, collected here so tests can assert there are none.
const captureErrors: string[] = [];

beforeEach(() => {
  captureErrors.length = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 100, 1000),
  );
});

describe("useItemDrag", () => {
  it("treats a press without movement as a click", () => {
    const { block, onCommit } = setup("move");
    drag(block, 2, 3);
    expect(onCommit).not.toHaveBeenCalled();
    expect(block).toHaveTextContent("idle");
  });

  it("ignores a press with another button", () => {
    const { block, onCommit } = setup("move");
    fireEvent.pointerDown(block, { button: 2, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 0, clientY: 96 });
    expect(block).toHaveTextContent("idle");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("previews a move while dragging", () => {
    const { block } = setup("move");
    fireEvent.pointerDown(block, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    expect(block).toHaveTextContent("600-660 day 0");
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 0, clientY: 48 });
    expect(block).toHaveTextContent("660-720 day 0");
  });

  it("moves a block by an hour per 48 pixels", () => {
    const { block, onCommit } = setup("move");
    drag(block, 0, 48);
    expect(onCommit).toHaveBeenCalledWith({
      startMin: 660,
      endMin: 720,
      dayDelta: 0,
      dayDeltaPx: 0,
    });
  });

  it("snaps to quarter hours", () => {
    const { block, onCommit } = setup("move");
    // 10 pixels is 12.5 minutes, which rounds to 15.
    drag(block, 0, 10);
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ startMin: 615, endMin: 675 }));
  });

  it("keeps a moved block inside the day", () => {
    const { block, onCommit } = setup("move");
    drag(block, 0, -2000);
    expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({ startMin: 0, endMin: 60 }));
  });

  it("keeps a moved block from running past midnight", () => {
    const { block, onCommit } = setup("move");
    drag(block, 0, 5000);
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ startMin: 1380, endMin: 1440 }),
    );
  });

  it("moves a block to another day column", () => {
    const { block, onCommit } = setup("move");
    drag(block, 110, 0);
    expect(onCommit).toHaveBeenCalledWith({
      startMin: 600,
      endMin: 660,
      dayDelta: 1,
      dayDeltaPx: 100,
    });
  });

  it("keeps a move within the visible days", () => {
    const { block, onCommit } = setup("move");
    drag(block, 900, 0);
    expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({ dayDelta: 1 }));
    drag(block, -900, 0);
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ dayDelta: -1, dayDeltaPx: -100 }),
    );
  });

  it("moves the start when resizing from the top, never past a quarter hour before the end", () => {
    const { block, onCommit } = setup("resize-start");
    drag(block, 0, -48);
    expect(onCommit).toHaveBeenLastCalledWith({
      startMin: 540,
      endMin: 660,
      dayDelta: 0,
      dayDeltaPx: 0,
    });
    drag(block, 0, 500);
    expect(onCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ startMin: 645, endMin: 660 }),
    );
  });

  it("never changes the day while resizing", () => {
    const { block, onCommit } = setup("resize-end");
    drag(block, 300, 48);
    expect(onCommit).toHaveBeenLastCalledWith({
      startMin: 600,
      endMin: 720,
      dayDelta: 0,
      dayDeltaPx: 0,
    });
  });

  it("keeps a resized end between a quarter hour after the start and midnight", () => {
    const { block, onCommit } = setup("resize-end");
    drag(block, 0, -500);
    expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({ endMin: 615 }));
    drag(block, 0, 5000);
    expect(onCommit).toHaveBeenLastCalledWith(expect.objectContaining({ endMin: 1440 }));
  });

  it("cancels on Escape", () => {
    const { block, onCommit } = setup("move");
    fireEvent.pointerDown(block, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 0, clientY: 96 });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(block).toHaveTextContent("idle");
    fireEvent.pointerUp(block, { pointerId: 1, clientX: 0, clientY: 96 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("cancels when the pointer is cancelled", () => {
    const { block, onCommit } = setup("move");
    fireEvent.pointerDown(block, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 0, clientY: 96 });
    fireEvent.pointerCancel(block, { pointerId: 1 });
    fireEvent.pointerUp(block, { pointerId: 1, clientX: 0, clientY: 96 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ignores another pointer", () => {
    const { block, onCommit } = setup("move");
    fireEvent.pointerDown(block, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(block, { pointerId: 2, clientX: 0, clientY: 96 });
    expect(block).toHaveTextContent("600-660");
    fireEvent.pointerUp(block, { pointerId: 2, clientX: 0, clientY: 96 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("takes pointer capture once movement confirms a drag, without errors", () => {
    const capture = vi.spyOn(HTMLElement.prototype, "setPointerCapture");
    const { block, onCommit } = setup("move");
    drag(block, 0, 48);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(1);
    expect(captureErrors).toEqual([]);
  });

  it("swallows the click that follows a move drag", () => {
    const { block } = setup("move");
    const onClick = vi.fn();
    block.addEventListener("click", onClick);
    drag(block, 0, 48);
    fireEvent.click(block);
    expect(onClick).not.toHaveBeenCalled();
  });
});
