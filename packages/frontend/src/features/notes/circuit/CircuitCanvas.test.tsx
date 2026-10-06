import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@nookly/ui/components/tooltip";
import { expectNoA11yViolations } from "#/test/axe.ts";
import { renderWithProviders } from "#/test/render.tsx";
import { CircuitCanvas } from "./CircuitCanvas";
import {
  addPart,
  connect,
  emptyDrawing,
  outPoint,
  parseDrawing,
  pinPoint,
  setLabel,
  stringifyDrawing,
  type Drawing,
  type PartKind,
} from "./drawing";

function Harness({
  initial = "",
  source: initialSource = "Y = A & B",
  onChange,
  onSourceChange,
}: {
  initial?: string;
  source?: string;
  onChange: (drawing: string) => void;
  onSourceChange?: (code: string) => void;
}) {
  const [drawing, setDrawing] = useState(initial);
  const [source, setSource] = useState(initialSource);
  return (
    <CircuitCanvas
      drawing={drawing}
      source={source}
      onSourceChange={(code) => {
        onSourceChange?.(code);
        setSource(code);
      }}
      onChange={(next) => {
        onChange(next);
        setDrawing(next);
      }}
    />
  );
}

function setup(initial: Drawing = emptyDrawing(), source?: string) {
  const onChange = vi.fn<(drawing: string) => void>();
  const onSourceChange = vi.fn<(code: string) => void>();
  const view = renderWithProviders(
    <Harness
      initial={stringifyDrawing(initial)}
      source={source}
      onChange={onChange}
      onSourceChange={onSourceChange}
    />,
  );
  const last = () => parseDrawing(onChange.mock.lastCall?.[0] ?? "");
  const canvas = () => screen.getByRole("application", { name: /circuit drawing/i });
  return { ...view, onChange, onSourceChange, last, canvas };
}

/// A drawing of `kinds` with the ids they got.
function draw(kinds: PartKind[]) {
  let drawing = emptyDrawing();
  const ids: string[] = [];
  for (const kind of kinds) {
    const added = addPart(drawing, kind);
    drawing = added.drawing;
    ids.push(added.id);
  }
  return { drawing, ids };
}

const point = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, button: 0 });

describe("CircuitCanvas", () => {
  it("adds a part from the palette", async () => {
    const { user, last } = setup();
    await user.click(screen.getByRole("button", { name: "Add AND gate" }));
    expect(last().parts.map((p) => p.kind)).toEqual(["AND"]);
    expect(screen.getByRole("button", { name: "AND gate 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add input" }));
    await user.click(screen.getByRole("button", { name: "Add output" }));
    expect(last().parts.map((p) => p.kind)).toEqual(["AND", "INPUT", "OUTPUT"]);
  });

  it("draws a wire by dragging from an output to an input pin", () => {
    const { drawing, ids } = draw(["INPUT", "NOT"]);
    const { last, canvas } = setup(drawing);
    const from = outPoint(drawing.parts[0]!);
    const to = pinPoint(drawing.parts[1]!, 0);
    fireEvent.pointerDown(canvas(), point(from.x, from.y));
    fireEvent.pointerMove(canvas(), point(to.x - 2, to.y));
    fireEvent.pointerUp(canvas(), point(to.x - 2, to.y));
    expect(last().wires).toEqual([{ from: ids[0], to: ids[1], pin: 0 }]);
  });

  it("wires with two clicks too", () => {
    const { drawing, ids } = draw(["INPUT", "NOT"]);
    const { last, canvas } = setup(drawing);
    const from = outPoint(drawing.parts[0]!);
    const to = pinPoint(drawing.parts[1]!, 0);
    fireEvent.pointerDown(canvas(), point(from.x, from.y));
    fireEvent.pointerUp(canvas(), point(from.x, from.y));
    expect(screen.getByRole("status")).toHaveTextContent(/click an input pin/i);
    fireEvent.pointerDown(canvas(), point(to.x, to.y));
    fireEvent.pointerUp(canvas(), point(to.x, to.y));
    expect(last().wires).toEqual([{ from: ids[0], to: ids[1], pin: 0 }]);
  });

  it("drops a wire let go over nothing", () => {
    const { drawing } = draw(["INPUT", "NOT"]);
    const { onChange, canvas } = setup(drawing);
    const from = outPoint(drawing.parts[0]!);
    fireEvent.pointerDown(canvas(), point(from.x, from.y));
    fireEvent.pointerMove(canvas(), point(700, 400));
    fireEvent.pointerUp(canvas(), point(700, 400));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves a part by dragging it, onto the grid, and saves once", () => {
    const { drawing } = draw(["NOT"]);
    const { onChange, last, canvas } = setup(drawing);
    const part = drawing.parts[0]!;
    const grab = { x: part.x + 15, y: part.y + 10 };
    fireEvent.pointerDown(canvas(), point(grab.x, grab.y));
    fireEvent.pointerMove(canvas(), point(grab.x + 33, grab.y + 21));
    fireEvent.pointerMove(canvas(), point(grab.x + 52, grab.y + 38));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(canvas(), point(grab.x + 52, grab.y + 38));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last().parts[0]).toMatchObject({ x: part.x + 50, y: part.y + 40 });
  });

  it("selects with focus, moves with the arrows and deletes with the key", async () => {
    const { drawing } = draw(["NOT", "AND"]);
    const { user, last } = setup(drawing);
    const not = screen.getByRole("button", { name: "NOT gate 1" });
    act(() => not.focus());
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(last().parts[0]).toMatchObject({
      x: drawing.parts[0]!.x + 10,
      y: drawing.parts[0]!.y + 10,
    });
    await user.keyboard("{Delete}");
    expect(last().parts.map((p) => p.kind)).toEqual(["AND"]);
  });

  it("wires from the selection panel without a pointer", async () => {
    const { drawing, ids } = draw(["INPUT", "INPUT", "AND"]);
    const { user, last } = setup(drawing);
    act(() => screen.getByRole("button", { name: "AND gate 1" }).focus());
    await user.selectOptions(screen.getByLabelText("Input 1 comes from"), "Input A");
    await user.selectOptions(screen.getByLabelText("Input 2 comes from"), "Input B");
    expect(last().wires).toEqual([
      { from: ids[0], to: ids[2], pin: 0 },
      { from: ids[1], to: ids[2], pin: 1 },
    ]);
    await user.selectOptions(screen.getByLabelText("Input 2 comes from"), "Not connected");
    expect(last().wires).toHaveLength(1);
  });

  it("renames an input and changes the pins and bubbles of a gate", async () => {
    const { drawing } = draw(["INPUT", "AND"]);
    const { user, last } = setup(drawing);
    act(() => screen.getByRole("button", { name: "Input A" }).focus());
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Cin");
    expect(last().parts[0]?.label).toBe("Cin");

    act(() => screen.getByRole("button", { name: "AND gate 1" }).focus());
    await user.click(screen.getByRole("button", { name: "Add input pin" }));
    expect(last().parts[1]?.pins).toBe(3);
    await user.click(screen.getByRole("button", { name: "Negate input 2" }));
    expect(last().parts[1]?.negated).toEqual([false, true, false]);
    expect(screen.getByRole("button", { name: "Negate input 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Remove input pin" }));
    expect(last().parts[1]?.pins).toBe(2);
  });

  it("undoes and redoes", async () => {
    const { user, last, onChange } = setup();
    await user.click(screen.getByRole("button", { name: "Add NOT gate" }));
    await user.click(screen.getByRole("button", { name: "Add input" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(last().parts.map((p) => p.kind)).toEqual(["NOT"]);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onChange.mock.lastCall?.[0]).toBe("");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(last().parts.map((p) => p.kind)).toEqual(["NOT"]);
  });

  it("deletes the selection from the toolbar", async () => {
    const { drawing } = draw(["NOT"]);
    const { user, last } = setup(drawing);
    expect(screen.getByRole("button", { name: "Delete selection" })).toBeDisabled();
    act(() => screen.getByRole("button", { name: "NOT gate 1" }).focus());
    await user.click(screen.getByRole("button", { name: "Delete selection" }));
    expect(last().parts).toEqual([]);
  });

  it("follows a drawing changed from outside", () => {
    const { drawing } = draw(["NOT"]);
    const canvas = (stored: string) => (
      <TooltipProvider>
        <CircuitCanvas drawing={stored} source="" onChange={() => {}} onSourceChange={() => {}} />
      </TooltipProvider>
    );
    const { rerender } = render(canvas(""));
    expect(screen.queryByRole("button", { name: "NOT gate 1" })).toBeNull();
    rerender(canvas(stringifyDrawing(drawing)));
    expect(screen.getByRole("button", { name: "NOT gate 1" })).toBeInTheDocument();
  });
});

describe("CircuitCanvas check", () => {
  function halfAdderish() {
    const { drawing, ids } = draw(["INPUT", "INPUT", "AND", "OUTPUT"]);
    let d = setLabel(drawing, ids[3]!, "Y");
    d = connect(d, ids[0]!, ids[2]!, 0);
    d = connect(d, ids[1]!, ids[2]!, 1);
    d = connect(d, ids[2]!, ids[3]!, 0);
    return d;
  }

  it("says when the circuit matches the code", async () => {
    const { user } = setup(halfAdderish(), "Y = A & B");
    await user.click(screen.getByRole("button", { name: "Check against code" }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Equal\./);
  });

  it("says where it differs", async () => {
    const { user } = setup(halfAdderish(), "Y = A | B");
    await user.click(screen.getByRole("button", { name: "Check against code" }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Not equal\./);
  });

  it("explains a problem in the code", async () => {
    const { user } = setup(halfAdderish(), "Y = A &");
    await user.click(screen.getByRole("button", { name: "Check against code" }));
    expect(screen.getByRole("status")).toHaveTextContent(/code has a problem.*Line 1/i);
  });

  it("asks for code when there is none", async () => {
    const { user } = setup(halfAdderish(), "  ");
    await user.click(screen.getByRole("button", { name: "Check against code" }));
    expect(screen.getByRole("status")).toHaveTextContent(/write the circuit in the code tab/i);
  });

  it("clears the answer once the drawing changes", async () => {
    const { user } = setup(halfAdderish(), "Y = A & B");
    await user.click(screen.getByRole("button", { name: "Check against code" }));
    await user.click(screen.getByRole("button", { name: "Add NOT gate" }));
    expect(within(document.body).queryByText(/^Equal\./)).toBeNull();
  });
});

describe("CircuitCanvas accessibility", () => {
  it("has no violations with a drawing and a selection", async () => {
    const { drawing } = draw(["INPUT", "INPUT", "AND", "OUTPUT"]);
    const { container } = setup(drawing);
    act(() => screen.getByRole("button", { name: "AND gate 1" }).focus());
    await expectNoA11yViolations(container);
  });

  describe("writing the code", () => {
    /// A wired INPUT -> NOT -> OUTPUT circuit, one wire short of finished.
    function almostDone() {
      let { drawing, ids } = draw(["INPUT", "NOT", "OUTPUT"]);
      drawing = setLabel(setLabel(drawing, ids[0]!, "A"), ids[2]!, "Y");
      drawing = connect(drawing, ids[0]!, ids[1]!, 0);
      return { drawing, ids };
    }

    it("writes the code once the drawing is finished", () => {
      const { drawing, ids } = almostDone();
      const { onSourceChange, canvas } = setup(drawing, "");
      const from = outPoint(drawing.parts[1]!);
      const to = pinPoint(drawing.parts[2]!, 0);
      expect(ids).toHaveLength(3);
      fireEvent.pointerDown(canvas(), point(from.x, from.y));
      fireEvent.pointerMove(canvas(), point(to.x - 2, to.y));
      fireEvent.pointerUp(canvas(), point(to.x - 2, to.y));
      expect(onSourceChange).toHaveBeenLastCalledWith("Y = !A");
    });

    it("writes nothing while the drawing is unfinished", async () => {
      const { user, onSourceChange } = setup(emptyDrawing(), "");
      await user.click(screen.getByRole("button", { name: "Add AND gate" }));
      expect(onSourceChange).not.toHaveBeenCalled();
    });

    it("keeps code that is not what the drawing was", () => {
      const { drawing } = almostDone();
      const { onSourceChange, canvas } = setup(drawing, "Y = A & B");
      const from = outPoint(drawing.parts[1]!);
      const to = pinPoint(drawing.parts[2]!, 0);
      fireEvent.pointerDown(canvas(), point(from.x, from.y));
      fireEvent.pointerMove(canvas(), point(to.x - 2, to.y));
      fireEvent.pointerUp(canvas(), point(to.x - 2, to.y));
      expect(onSourceChange).not.toHaveBeenCalled();
    });
  });
});
