/// <reference lib="dom" />
import type { Attrs, Node as ProseNode } from "prosemirror-model";
import { Selection } from "prosemirror-state";
import type { EditorView, NodeViewConstructor } from "prosemirror-view";
import {
  CHECK,
  CLOSE,
  INDENT,
  OUTDENT,
  PLUS,
  button,
  el,
  field,
  markOf,
  text,
} from "./block-dom.ts";
import {
  FIELD_CELLS,
  ROW_SPECS,
  type RowBlockType,
  type RowSpec,
  currentStep,
  nextTimelineState,
  shiftTree,
  treeDepths,
} from "./row-model.ts";

/// What the row blocks ask of the page: its editable state and where the caret is, so the phone
/// scrolls the field being typed in above the keyboard.
export interface RowBlockActions {
  editable(): boolean;
  caret(bottom: number): void;
}

/// The row blocks as the desktop draws them (Steps, Tree, Details, Stats, Progress, Timeline), as
/// forms in the page: a title, a row of inputs for each row, a button to remove it and one to
/// add another. Typing writes the block's `rows` at once, in the line format every client reads.
export function rowBlockView(type: RowBlockType, actions: RowBlockActions): NodeViewConstructor {
  const spec: RowSpec = ROW_SPECS[type];
  return (node, view, getPos) => {
    const dom = el("div", `rb rb-${type}`, { "data-node": type });
    dom.contentEditable = "false";
    const head = el("div", "rb-head");
    const title = field("rb-title", `${spec.titlePlaceholder} title`, spec.titlePlaceholder, "");
    head.innerHTML = `<span class="rb-mark">${markOf(spec.icon, 16)}</span>`;
    head.append(title);
    const body = el("div", "rb-body");
    dom.append(head, body);

    // The block as the screen shows it; the node's attributes follow it.
    let cells: string[][] = [];
    let current: number | null = null;
    let pending: { row: number; field: number } | null = null;
    // What the screen shows: the node as last written or drawn.
    let shown = node;

    const read = (n: ProseNode) => {
      cells = spec.read(text(n.attrs.rows));
      current = type === "steps" ? currentStep(n.attrs.current) : null;
      title.value = text(n.attrs.title);
    };

    const commit = () => {
      const pos = getPos();
      if (pos === undefined) return;
      const written: Attrs = { ...node.attrs, rows: spec.write(cells), title: title.value || null };
      const attrs: Attrs =
        type === "steps"
          ? { ...written, current: current === null ? null : String(current) }
          : written;
      node = node.type.create(attrs, null, node.marks);
      shown = node;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, attrs));
    };

    /// Takes the block out of the page, the cursor to where it was.
    const removeBlock = () => {
      const pos = getPos();
      if (pos === undefined) return;
      const tr = view.state.tr.delete(pos, pos + node.nodeSize);
      view.dispatch(
        tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1)),
      );
      view.focus();
    };

    const focusField = (row: number, cell: number) => {
      pending = { row, field: cell };
      settle();
    };
    const settle = () => {
      if (!pending) return;
      const input = body.querySelector<HTMLInputElement>(
        `[data-row="${pending.row}"][data-cell="${pending.field}"]`,
      );
      if (!input) return;
      pending = null;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    const insertAfter = (index: number, cell = 0) => {
      if (spec.max !== undefined && cells.length >= spec.max) return;
      cells = [...cells.slice(0, index + 1), spec.blank(cells, index), ...cells.slice(index + 1)];
      if (type === "steps" && current !== null && current > index + 1) current += 1;
      commit();
      draw();
      focusField(index + 1, cell);
    };

    const remove = (index: number) => {
      if (cells.length === 1) return removeBlock();
      cells = cells.filter((_, i) => i !== index);
      if (type === "steps" && current !== null && current > index + 1) current -= 1;
      commit();
      draw();
      focusField(Math.max(0, index - 1), FIELD_CELLS[type][0]);
    };

    const patch = (index: number, cell: number, value: string) => {
      cells = cells.map((row, i) =>
        i === index ? row.map((c, j) => (j === cell ? value : c)) : row,
      );
      commit();
    };

    /// A row with nothing typed in it: Backspace in its empty field takes it away.
    const blank = (row: string[] | undefined) =>
      (type === "progress" ? [FIELD_CELLS[type][0]] : FIELD_CELLS[type].slice(0, 2)).every(
        (c) => (row?.[c] ?? "") === "",
      );

    const draw = () => {
      const editable = actions.editable();
      title.readOnly = !editable;
      body.replaceChildren();
      const depths = type === "tree" ? treeDepths(cells) : [];
      cells.forEach((row, index) => {
        const line = el("div", "rb-row", { "data-row": String(index) });
        if (type === "steps") line.append(stepMarker(index));
        if (type === "timeline") line.append(timelineMarker(index, row[2] ?? "done"));
        if (type === "tree") line.style.paddingLeft = `${(depths[index] ?? 0) * 18}px`;
        const inputs = el("div", "rb-fields");
        spec.fields.forEach((f, n) => {
          const cell = FIELD_CELLS[type][n];
          const input = field(
            `rb-in rb-${f.name}`,
            `${f.placeholder}, row ${index + 1}`,
            f.placeholder,
            row[cell] ?? "",
            {
              numeric: f.numeric,
              readOnly: !editable,
            },
          );
          input.dataset.row = String(index);
          input.dataset.cell = String(cell);
          input.addEventListener("input", () => patch(index, cell, input.value));
          input.addEventListener("focus", () =>
            actions.caret(input.getBoundingClientRect().bottom + window.scrollY),
          );
          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              insertAfter(index, cell);
            } else if (event.key === "Backspace" && input.value === "" && blank(cells[index])) {
              event.preventDefault();
              remove(index);
            }
          });
          if (type === "progress" && f.name === "label") inputs.append(input, bar(cells[index]));
          else inputs.append(input);
        });
        line.append(inputs);
        if (editable) {
          if (type === "tree") {
            line.append(
              button("rb-icon", "Outdent", OUTDENT, () => nest(index, -1)),
              button("rb-icon", "Indent", INDENT, () => nest(index, 1)),
            );
          }
          line.append(button("rb-icon rb-x", spec.removeLabel, CLOSE, () => remove(index)));
        }
        body.append(line);
      });
      if (editable && (spec.max === undefined || cells.length < spec.max)) {
        const add = button("rb-add", spec.addLabel, `${PLUS}<span>${spec.addLabel}</span>`, () =>
          insertAfter(cells.length - 1),
        );
        body.append(add);
      }
      settle();
    };

    const nest = (index: number, by: 1 | -1) => {
      const next = shiftTree(cells, index, by);
      if (next === cells) return;
      cells = next;
      commit();
      draw();
      focusField(index, 1);
    };

    /// Steps: a number to press, which is the step you are on; a finished step shows a tick.
    const stepMarker = (index: number) => {
      const number = index + 1;
      const done = current !== null && number < current;
      const active = number === current;
      const marker = button(
        `rb-step${done ? " done" : ""}${active ? " active" : ""}`,
        `${active ? "Mark as Done" : "Mark as Current"}: step ${number}`,
        done ? CHECK : String(number),
        () => {
          if (!actions.editable()) return;
          current = active ? number + 1 : number;
          commit();
          draw();
        },
      );
      return marker;
    };

    /// Timeline: a dot for done, now or next, pressed to move round.
    const timelineMarker = (index: number, state: string) => {
      const next = nextTimelineState(state);
      return button(
        `rb-dot ${state === "now" || state === "next" ? state : "done"}`,
        `Mark as ${next}: row ${index + 1}`,
        "",
        () => {
          if (!actions.editable()) return;
          cells = cells.map((row, i) => (i === index ? [row[0], row[1], next] : row));
          commit();
          draw();
        },
      );
    };

    /// Progress: how far the value is on its way to the goal.
    const bar = (row: string[]) => {
      const goal = Number(row[2]) > 0 ? Number(row[2]) : 10;
      const ratio = Math.max(0, Math.min(1, (Number(row[1]) || 0) / goal));
      const track = el("div", `rb-track${ratio >= 1 ? " reached" : ""}`);
      const fill = el("div", "rb-fill");
      fill.style.width = `${ratio * 100}%`;
      track.append(fill);
      return track;
    };

    title.addEventListener("input", commit);
    title.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        focusField(0, FIELD_CELLS[type][0]);
      }
    });

    read(node);
    draw();
    return {
      dom,
      update(next: ProseNode) {
        if (next.type !== node.type) return false;
        const same =
          next.attrs.rows === shown.attrs.rows &&
          next.attrs.title === shown.attrs.title &&
          next.attrs.current === shown.attrs.current;
        node = next;
        shown = next;
        // What this block just wrote is already on the screen; a change from elsewhere is drawn.
        if (same) return true;
        read(next);
        draw();
        return true;
      },
      stopEvent: () => true,
      ignoreMutation: () => true,
    };
  };
}

export type { EditorView };
