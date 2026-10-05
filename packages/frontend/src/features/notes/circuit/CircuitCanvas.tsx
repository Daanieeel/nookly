import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconMinus,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import { cn } from "@nookly/ui/lib/utils";
import { ToolbarButton } from "../ToolbarButton";
import type { InteractiveProps } from "../SourceBlock";
import { gatePrims, inputPrims, outputPrims, FONT_FAMILY, type Prim } from "./draw";
import {
  addPart,
  boxOf,
  connect,
  describePart,
  type Drawing,
  GATE_KINDS,
  GRID,
  hitTest,
  MAX_PINS,
  MIN_PINS,
  movePart,
  outPoint,
  type Part,
  type PartKind,
  parseDrawing,
  type Point,
  pinPoint,
  removePart,
  removeWire,
  setLabel,
  setPins,
  stringifyDrawing,
  toggleNegated,
  wireKey,
  wirePoints,
  drawingModel,
  PIN_HIT,
} from "./drawing";
import { circuitModel, compareModels, type CheckResult } from "./evaluate";
import type { Run } from "./label";
import { CircuitError, parseCircuit } from "./parse";
import { PrimView } from "./PrimView";
import { STROKE } from "./symbols";

type Selection = { kind: "part"; id: string } | { kind: "wire"; key: string } | null;

interface Wiring {
  from: string;
  start: Point;
  at: Point;
  /// Let go without moving: the next click on an input pin finishes the wire.
  armed: boolean;
}

interface Drag {
  id: string;
  /// Where inside the part it was grabbed.
  grab: Point;
  base: Drawing;
  moved: boolean;
}

interface History {
  past: Drawing[];
  future: Drawing[];
}

const HISTORY_LIMIT = 50;
const CLICK_SLOP = 4;
const NOT_CONNECTED = "";

const nameRuns = (part: Part): Run[] => [{ text: part.label || "?", bars: 0, italic: true }];

function partPrims(part: Part): Prim[] {
  const box = boxOf(part);
  if (part.kind === "INPUT") return inputPrims(nameRuns(part), box.width);
  if (part.kind === "OUTPUT") return outputPrims(nameRuns(part));
  return box.symbol ? gatePrims(box.symbol, part.negated) : [];
}

/// How far an arrow key moves a part, or nothing for any other key.
function arrowStep(key: string, step: number): Point | undefined {
  switch (key) {
    case "arrowleft":
      return { x: -step, y: 0 };
    case "arrowright":
      return { x: step, y: 0 };
    case "arrowup":
      return { x: 0, y: -step };
    case "arrowdown":
      return { x: 0, y: step };
  }
}

const polyline = (points: Point[]) =>
  points.map((p, index) => `${index === 0 ? "M" : "L"}${p.x} ${p.y}`).join("");

const PALETTE: { kind: PartKind; label: string; name: string }[] = [
  ...GATE_KINDS.map((kind) => ({ kind, label: kind, name: `Add ${kind} gate` })),
  { kind: "INPUT", label: "Input", name: "Add input" },
  { kind: "OUTPUT", label: "Output", name: "Add output" },
];

const SELECT_CLASS =
  "h-8 min-w-0 rounded-md border border-input bg-accent px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

/// The interactive tab of a circuit block: gates are placed and wired by hand, as
/// on paper. It never reads the block's code except to check the drawing against it.
export function CircuitCanvas({ drawing: stored, source, onChange }: InteractiveProps) {
  const [drawing, setDrawing] = useState(() => parseDrawing(stored));
  const [history, setHistory] = useState<History>({ past: [], future: [] });
  const [selected, setSelected] = useState<Selection>(null);
  const [wiring, setWiring] = useState<Wiring | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [available, setAvailable] = useState(0);
  const emitted = useRef(stored);
  const drag = useRef<Drag | null>(null);
  const merging = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridId = useId();

  // A drawing changed from elsewhere (undo in the editor, another window) replaces ours.
  useEffect(() => {
    if (stored === emitted.current) return;
    emitted.current = stored;
    setDrawing(parseDrawing(stored));
    setHistory({ past: [], future: [] });
    setSelected(null);
    setResult(null);
  }, [stored]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => setAvailable(wrap.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const apply = (next: Drawing) => {
    const text = stringifyDrawing(next);
    emitted.current = text;
    setDrawing(next);
    setResult(null);
    onChange(text);
  };

  /// Saves `next`, and remembers `base` for undo. Edits sharing a `merge` key, like
  /// the letters of a name, make one undo step.
  const commit = (next: Drawing, base: Drawing = drawing, merge: string | null = null) => {
    if (next === base) return;
    if (merge === null || merge !== merging.current) {
      setHistory((h) => ({ past: [...h.past, base].slice(-HISTORY_LIMIT), future: [] }));
    }
    merging.current = merge;
    apply(next);
  };

  const undo = () => {
    const previous = history.past[history.past.length - 1];
    if (!previous) return;
    merging.current = null;
    setHistory({ past: history.past.slice(0, -1), future: [drawing, ...history.future] });
    apply(previous);
  };

  const redo = () => {
    const [next, ...rest] = history.future;
    if (!next) return;
    merging.current = null;
    setHistory({ past: [...history.past, drawing], future: rest });
    apply(next);
  };

  const selectedPart =
    selected?.kind === "part" ? drawing.parts.find((p) => p.id === selected.id) : undefined;

  const deleteSelection = () => {
    if (selected?.kind === "part") commit(removePart(drawing, selected.id));
    else if (selected?.kind === "wire") commit(removeWire(drawing, selected.key));
    setSelected(null);
  };

  const add = (kind: PartKind) => {
    const added = addPart(drawing, kind);
    commit(added.drawing);
    setSelected({ kind: "part", id: added.id });
  };

  const toPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const finishWire = (from: string, at: Point) => {
    const hit = hitTest(drawing, at.x, at.y);
    if (hit.kind === "pin") commit(connect(drawing, from, hit.id, hit.pin));
    setWiring(null);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const at = toPoint(event);
    if (wiring?.armed) {
      finishWire(wiring.from, at);
      return;
    }
    const hit = hitTest(drawing, at.x, at.y);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // A pointer that is already gone can't be captured; the drag simply ends.
    }
    if (hit.kind === "out") {
      setSelected({ kind: "part", id: hit.id });
      setWiring({ from: hit.id, start: at, at, armed: false });
    } else if (hit.kind === "part" || hit.kind === "pin") {
      const part = drawing.parts.find((p) => p.id === hit.id);
      setSelected({ kind: "part", id: hit.id });
      if (part) {
        drag.current = {
          id: part.id,
          grab: { x: at.x - part.x, y: at.y - part.y },
          base: drawing,
          moved: false,
        };
      }
    } else if (hit.kind === "wire") {
      setSelected({ kind: "wire", key: hit.key });
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const at = toPoint(event);
    const current = drag.current;
    if (current) {
      current.moved = true;
      setDrawing(movePart(current.base, current.id, at.x - current.grab.x, at.y - current.grab.y));
    } else if (wiring) {
      setWiring({ ...wiring, at });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const at = toPoint(event);
    const current = drag.current;
    drag.current = null;
    if (current?.moved) {
      commit(
        movePart(current.base, current.id, at.x - current.grab.x, at.y - current.grab.y),
        current.base,
      );
    } else if (wiring && !wiring.armed) {
      const moved = Math.hypot(at.x - wiring.start.x, at.y - wiring.start.y) > CLICK_SLOP;
      if (moved) finishWire(wiring.from, at);
      else setWiring({ ...wiring, armed: true });
    }
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const arrow = arrowStep(key, event.shiftKey ? 5 * GRID : GRID);
    if (mod && key === "z") {
      if (event.shiftKey) redo();
      else undo();
    } else if (mod && key === "y") {
      redo();
    } else if (key === "escape") {
      setWiring(null);
      setSelected(null);
    } else if (key === "delete" || key === "backspace") {
      deleteSelection();
    } else if (arrow && selectedPart) {
      commit(
        movePart(drawing, selectedPart.id, selectedPart.x + arrow.x, selectedPart.y + arrow.y),
        drawing,
        `move:${selectedPart.id}`,
      );
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const check = () => {
    if (!source.trim()) {
      setResult({
        ok: false,
        message: "Write the circuit in the code tab first, then check your drawing against it.",
      });
      return;
    }
    try {
      setResult(compareModels(circuitModel(parseCircuit(source)), drawingModel(drawing)));
    } catch (error) {
      if (!(error instanceof CircuitError)) throw error;
      setResult({ ok: false, message: `The code has a problem. ${error.message}` });
    }
  };

  const extent = drawing.parts.reduce(
    (size, part) => {
      const box = boxOf(part);
      return {
        width: Math.max(size.width, part.x + box.width),
        height: Math.max(size.height, part.y + box.height),
      };
    },
    { width: 0, height: 0 },
  );
  const width = Math.max(available, extent.width + 80, 480);
  const height = Math.max(extent.height + 80, 260);

  const wiringFrom = wiring && drawing.parts.find((p) => p.id === wiring.from);
  const partsWithOutput = drawing.parts.filter((p) => p.kind !== "OUTPUT");
  const wireToPin = (part: Part, pin: number) =>
    drawing.wires.find((w) => w.to === part.id && w.pin === pin);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {PALETTE.map((item) => (
          <Button
            key={item.kind}
            variant="ghost"
            size="sm"
            aria-label={item.name}
            onClick={() => add(item.kind)}
            className="h-7 px-2"
          >
            {item.label}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton label="Undo" onClick={undo} disabled={history.past.length === 0}>
          <IconArrowBackUp />
        </ToolbarButton>
        <ToolbarButton label="Redo" onClick={redo} disabled={history.future.length === 0}>
          <IconArrowForwardUp />
        </ToolbarButton>
        <ToolbarButton label="Delete selection" onClick={deleteSelection} disabled={!selected}>
          <IconTrash />
        </ToolbarButton>
        <Button variant="secondary" size="sm" onClick={check} className="ml-auto h-7">
          Check against code
        </Button>
      </div>

      <div ref={wrapRef} className="overflow-x-auto rounded-md border text-foreground">
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- a drawing surface: it takes the pointer and the arrow keys, and each part inside is a focusable button */}
        <svg
          ref={svgRef}
          role="application"
          aria-label="Circuit drawing canvas"
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the surface takes the arrow keys
          tabIndex={0}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          fontFamily={FONT_FAMILY}
          className="block touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <defs>
            <pattern id={gridId} width={GRID * 2} height={GRID * 2} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={0.9} fill="var(--border)" stroke="none" />
            </pattern>
          </defs>
          <rect width={width} height={height} fill={`url(#${gridId})`} stroke="none" />

          {drawing.wires.map((wire) => {
            const key = wireKey(wire);
            const on = selected?.kind === "wire" && selected.key === key;
            return (
              <path
                key={key}
                d={polyline(wirePoints(drawing, wire))}
                strokeLinejoin="round"
                {...(on ? { stroke: "var(--primary)", strokeWidth: STROKE + 1.5 } : {})}
              />
            );
          })}

          {drawing.parts.map((part) => {
            const box = boxOf(part);
            const on = selected?.kind === "part" && selected.id === part.id;
            return (
              <g
                key={part.id}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an SVG group, which a native <button> can't be
                role="button"
                tabIndex={0}
                aria-label={describePart(drawing, part)}
                aria-pressed={on}
                className="outline-none"
                onFocus={() => setSelected({ kind: "part", id: part.id })}
              >
                <rect
                  x={part.x - 4}
                  y={part.y - 4}
                  width={box.width + 8}
                  height={box.height + 8}
                  rx={4}
                  fill="transparent"
                  strokeWidth={on ? 1.5 : 0}
                  strokeDasharray="4 3"
                  stroke="var(--primary)"
                />
                <g transform={`translate(${part.x} ${part.y})`}>
                  {partPrims(part).map((prim, index) => (
                    <PrimView key={index} prim={prim} />
                  ))}
                </g>
                {part.kind !== "OUTPUT" && (
                  <Pin at={outPoint(part)} lit={wiring?.from === part.id} />
                )}
                {Array.from({ length: part.pins }, (_, pin) => (
                  <Pin
                    key={pin}
                    at={pinPoint(part, pin)}
                    lit={!!wiring && wiring.from !== part.id}
                    wired={!!wireToPin(part, pin)}
                  />
                ))}
              </g>
            );
          })}

          {wiringFrom && wiring && (wiring.armed || wiring.at !== wiring.start) && (
            <path
              d={polyline([outPoint(wiringFrom), wiring.at])}
              strokeDasharray="5 4"
              stroke="var(--primary)"
              strokeWidth={1.75}
              pointerEvents="none"
            />
          )}
        </svg>
      </div>

      {selectedPart && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {(selectedPart.kind === "INPUT" || selectedPart.kind === "OUTPUT") && (
            <Input
              aria-label="Name"
              value={selectedPart.label}
              onChange={(event) =>
                commit(
                  setLabel(drawing, selectedPart.id, event.target.value),
                  drawing,
                  `label:${selectedPart.id}`,
                )
              }
              className="h-7 w-28"
            />
          )}
          {selectedPart.kind !== "INPUT" &&
            selectedPart.kind !== "OUTPUT" &&
            selectedPart.kind !== "NOT" && (
              <span className="flex items-center gap-1">
                <ToolbarButton
                  label="Remove input pin"
                  disabled={selectedPart.pins <= MIN_PINS}
                  onClick={() => commit(setPins(drawing, selectedPart.id, selectedPart.pins - 1))}
                >
                  <IconMinus />
                </ToolbarButton>
                <ToolbarButton
                  label="Add input pin"
                  disabled={selectedPart.pins >= MAX_PINS}
                  onClick={() => commit(setPins(drawing, selectedPart.id, selectedPart.pins + 1))}
                >
                  <IconPlus />
                </ToolbarButton>
              </span>
            )}
          {selectedPart.kind !== "INPUT" && selectedPart.kind !== "OUTPUT" && (
            <fieldset className="flex items-center gap-1" aria-label="Bubbles">
              <span className="text-muted-foreground">Bubble on</span>
              {selectedPart.negated.map((on, pin) => (
                <Button
                  key={pin}
                  variant={on ? "secondary" : "ghost"}
                  size="sm"
                  aria-label={`Negate input ${pin + 1}`}
                  aria-pressed={on}
                  onClick={() => commit(toggleNegated(drawing, selectedPart.id, pin))}
                  className="size-7 px-0"
                >
                  {pin + 1}
                </Button>
              ))}
            </fieldset>
          )}
          {Array.from({ length: selectedPart.pins }, (_, pin) => (
            <select
              key={pin}
              aria-label={
                selectedPart.kind === "OUTPUT" ? "Output comes from" : `Input ${pin + 1} comes from`
              }
              value={wireToPin(selectedPart, pin)?.from ?? NOT_CONNECTED}
              onChange={(event) =>
                commit(
                  event.target.value === NOT_CONNECTED
                    ? removeWire(drawing, `${selectedPart.id}:${pin}`)
                    : connect(drawing, event.target.value, selectedPart.id, pin),
                )
              }
              className={SELECT_CLASS}
            >
              <option value={NOT_CONNECTED}>Not connected</option>
              {partsWithOutput
                .filter((p) => p.id !== selectedPart.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {describePart(drawing, p)}
                  </option>
                ))}
            </select>
          ))}
        </div>
      )}

      <output
        className={cn(
          "min-h-4 text-xs",
          result ? (result.ok ? "text-positive" : "text-destructive") : "text-muted-foreground",
        )}
      >
        {wiring?.armed
          ? "Click an input pin to finish the wire. Press Escape to cancel."
          : (result?.message ?? "")}
      </output>
    </div>
  );
}

/// A connection point. Free input pins show faintly, and light up while a wire is
/// being drawn.
function Pin({ at, lit, wired }: { at: Point; lit: boolean; wired?: boolean }) {
  if (wired && !lit) return null;
  return (
    <circle
      cx={at.x}
      cy={at.y}
      r={lit ? PIN_HIT / 2 : 3}
      fill={lit ? "var(--primary)" : "none"}
      fillOpacity={lit ? 0.25 : 0}
      stroke={lit ? "var(--primary)" : "var(--muted-foreground)"}
      strokeWidth={1.25}
      aria-hidden
      pointerEvents="none"
    />
  );
}
