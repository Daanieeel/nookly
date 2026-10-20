"use dom";
/// <reference lib="dom" />

import { highlightCss } from "@nookly/shared/highlight";
import type { ParsedMacros } from "@nookly/shared/latex";
import { inlineMathView, mathBlockView } from "./math-views.ts";
import {
  undo as yUndo,
  redo as yRedo,
  yCursorPlugin,
  ySyncPlugin,
  yUndoPlugin,
} from "@tiptap/y-tiptap";
import { useDOMImperativeHandle } from "expo/dom";
import type { DOMProps } from "expo/dom";
import { baseKeymap } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { keymap } from "prosemirror-keymap";
import type { Node as ProseNode } from "prosemirror-model";
import { type Command, EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { type Ref, useEffect, useRef, useState } from "react";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { type AwarenessChanges, type Origin, fromBase64, toBase64 } from "./bridge.ts";
import type { EditorState as PhoneEditorState, ToolbarId } from "./toolbar.ts";
import {
  type Trigger,
  active,
  applyMention,
  applySlash,
  blockIds,
  indent,
  markdownRules,
  outdent,
  toggleBold,
  toggleBullets,
  toggleCode,
  toggleHeading,
  toggleHighlight,
  toggleItalic,
  toggleNumbers,
  toggleQuote,
  toggleStrike,
  toggleTaskAt,
  triggerAt,
  slashMatches,
  toggleTasks,
  toggleUnderline,
  typingKeys,
} from "./commands.ts";
import { pageSchema } from "./schema.ts";

const undo: Command = (state) => Boolean(yUndo(state));
const redo: Command = (state) => Boolean(yRedo(state));

/// The page editor as a web view: ProseMirror on the desktop's page schema, bound to a
/// Yjs document of its own. The phone's own document (offline copy, socket to the
/// server) and this one swap updates through the bridge, as base64 text; Yjs makes the
/// copies agree whatever the order or the repeats.

export interface EditorHandle {
  // Method syntax: the bridge sends JSON, which the methods here know to be text.
  applyUpdate(update: string): void;
  applyAwareness(update: string): void;
  run(command: string): void;
}

export interface EditorColors {
  foreground: string;
  background: string;
  muted: string;
  border: string;
  primary: string;
  /// A dark page: highlights are dimmed, as on the desktop.
  dark: boolean;
}

interface Props {
  ref: Ref<EditorHandle>;
  dom?: DOMProps;
  editable: boolean;
  person: { name: string; color: string };
  colors: EditorColors;
  /// The person's own LaTeX commands from Settings.
  macros: ParsedMacros["macros"];
  placeholder: string;
  /// The web view has started: the phone answers with the document so far.
  onReady: () => Promise<void>;
  onUpdate: (update: string) => Promise<void>;
  onAwareness: (update: string) => Promise<void>;
  /// Whether the editor has the keyboard and which formats are on, as JSON.
  onState: (state: string) => Promise<void>;
  /// Finds items to mention by what was typed after the `@`, as JSON: `[{ id, title, key }]`.
  /// This device's name for end to end checks, which also drive the editor.
  automationDevice: string;
  onSearch: (query: string) => Promise<string>;
  /// A link or mention was tapped: what it points at (`mention:<id>` or a web address).
  onOpen: (href: string) => Promise<void>;
  /// Where the cursor's line ends, from the top of the editor, so the page can scroll to it.
  onCaret: (bottom: number) => Promise<void>;
}

const COMMANDS = {
  bold: toggleBold,
  italic: toggleItalic,
  underline: toggleUnderline,
  strike: toggleStrike,
  code: toggleCode,
  highlight: toggleHighlight,
  h1: toggleHeading(1),
  h2: toggleHeading(2),
  bullets: toggleBullets,
  numbers: toggleNumbers,
  tasks: toggleTasks,
  quote: toggleQuote,
  outdent,
  indent,
  undo,
  redo,
} satisfies Record<ToolbarId, Command>;

const isToolbarId = (id: string): id is ToolbarId => Object.hasOwn(COMMANDS, id);

const CSS = `
html, body { margin: 0; height: auto; min-height: 0; background: transparent; -webkit-text-size-adjust: 100%; }
.root { font: 17px/1.55 -apple-system, system-ui, "Inter", sans-serif; color: var(--fg); }
.pm { outline: none; padding: 0 0 24px; min-height: 120px; word-break: break-word; position: relative; }
.pm > p:only-child:has(> br.ProseMirror-trailingBreak:only-child)::before { content: attr(data-placeholder); color: var(--muted); position: absolute; pointer-events: none; }
.pm p { margin: 0 0 .6em; }
.pm h1 { font-size: 1.7em; line-height: 1.25; margin: 1em 0 .4em; }
.pm h2 { font-size: 1.4em; line-height: 1.3; margin: .9em 0 .4em; }
.pm h3, .pm h4, .pm h5, .pm h6 { font-size: 1.15em; margin: .8em 0 .3em; }
.pm ul, .pm ol { margin: 0 0 .6em; padding-left: 1.4em; }
.pm li > p { margin: 0 0 .2em; }
.pm ul:has(> li.task) { list-style: none; padding-left: .2em; }
.pm li.task { display: flex; gap: .55em; align-items: baseline; }
.pm li.task::before { content: ""; flex: none; width: .95em; height: .95em; border: 1.5px solid var(--muted); border-radius: .25em; transform: translateY(.12em); }
.pm li.task[data-checked="true"]::before { background: var(--primary); border-color: var(--primary); }
.pm li.task[data-checked="true"] { color: var(--muted); }
.pm blockquote { margin: 0 0 .6em; padding-left: .9em; border-left: 3px solid var(--border); color: var(--muted); }
.pm pre { margin: 0 0 .6em; padding: .7em .8em; border-radius: 8px; background: color-mix(in srgb, var(--fg) 7%, transparent); overflow-x: auto; font: 14px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
.pm code { font: .9em ui-monospace, Menlo, monospace; background: color-mix(in srgb, var(--fg) 8%, transparent); padding: .1em .3em; border-radius: 4px; }
.pm pre code { background: none; padding: 0; }
.pm a { color: var(--primary); }
.pm .math { padding: 0 .15em; }
.pm .math math { font-size: 1.05em; }
.pm .math-empty, .pm .math-error { color: var(--muted); font: .9em ui-monospace, Menlo, monospace; }
.pm .mathblock .source { margin-bottom: .2em; font-size: 13px; opacity: .75; }
.pm .mathblock .rendered { padding: .2em 0 .6em; overflow-x: auto; text-align: center; }
.pm .mathblock .rendered:empty { display: none; }
.pm hr { border: 0; border-top: 1px solid var(--border); margin: 1em 0; }
.pm table { border-collapse: collapse; margin: 0 0 .6em; width: 100%; }
.pm td, .pm th { border: 1px solid var(--border); padding: .35em .5em; vertical-align: top; }
.pm .callout { margin: 0 0 .6em; padding: .7em .8em; border-radius: 8px; border: 1px solid var(--border); background: color-mix(in srgb, var(--primary) 8%, transparent); }
.pm .toggle { margin: 0 0 .6em; padding-left: .9em; border-left: 3px solid var(--border); }
.pm .card { margin: 0 0 .6em; padding: .7em .8em; border-radius: 8px; border: 1px solid var(--border); color: var(--muted); font-size: .9em; user-select: none; }
.pm .math { font-family: ui-monospace, Menlo, monospace; color: var(--muted); }
.menu { position: absolute; z-index: 5; width: 232px; max-height: 240px; overflow-y: auto; padding: 4px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); box-shadow: 0 6px 24px rgba(0,0,0,.25); }
.menu button { display: flex; width: 100%; align-items: baseline; justify-content: space-between; gap: 8px; padding: 9px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--fg); font: 15px/1.2 -apple-system, system-ui, sans-serif; text-align: left; }
.menu button:active { background: color-mix(in srgb, var(--primary) 15%, transparent); }
.menu small { color: var(--muted); font-size: 12px; }
.menu p { margin: 0; padding: 9px 10px; color: var(--muted); font: 14px/1.3 -apple-system, system-ui, sans-serif; }
.pm .ProseMirror-selectednode { outline: 2px solid var(--primary); }
.pm[contenteditable="false"] { caret-color: transparent; }
.collaboration-cursor__caret, .ProseMirror-yjs-cursor { position: relative; margin-left: -1px; margin-right: -1px; border-left: 2px solid; border-right: 2px solid; word-break: normal; pointer-events: none; }
.ProseMirror-yjs-cursor > div { position: absolute; top: -1.35em; left: -2px; padding: 1px 5px; border-radius: 4px 4px 4px 0; color: #fff; font: 600 11px/1.3 -apple-system, system-ui, sans-serif; white-space: nowrap; user-select: none; }
`;

export default function PageEditorDom({
  ref,
  editable,
  person,
  colors,
  macros,
  placeholder,
  onReady,
  onUpdate,
  onAwareness,
  onState,
  onCaret,
  automationDevice,
  onSearch,
  onOpen,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const doc = useRef(new Y.Doc());
  const awareness = useRef(new Awareness(doc.current));
  const focused = useRef(false);
  /// The menu open under the cursor: block types after a slash, items after an at sign.
  const [menu, setMenu] = useState<{
    trigger: Trigger;
    left: number;
    top: number;
  } | null>(null);
  const [found, setFound] = useState<{ id: string; title: string; key: string }[]>([]);

  const methods = {
    applyUpdate: (update: string) =>
      Y.applyUpdate(doc.current, fromBase64(String(update)), "remote"),
    applyAwareness: (update: string) =>
      applyAwarenessUpdate(awareness.current, fromBase64(String(update)), "remote"),
    run: (command: string) => {
      const editor = view.current;
      const id = String(command);
      if (editor && isToolbarId(id)) COMMANDS[id](editor.state, editor.dispatch, editor);
      editor?.focus();
    },
  } satisfies EditorHandle;
  // SAFETY: Expo types a handle as functions of JSON and sees a second copy of React's
  // types; these methods take the text the bridge carries.
  useDOMImperativeHandle(ref as never, () => methods as never, []);

  // The document: edits made here go to the phone's copy.
  useEffect(() => {
    const d = doc.current;
    const a = awareness.current;
    const sendUpdate = (update: Uint8Array, origin: Origin) => {
      if (origin !== "remote") void onUpdate(toBase64(update));
    };
    const sendAwareness = (_changes: AwarenessChanges, origin: Origin) => {
      if (origin !== "remote") void onAwareness(toBase64(encodeAwarenessUpdate(a, [a.clientID])));
    };
    d.on("update", sendUpdate);
    a.on("update", sendAwareness);
    void onReady();
    return () => {
      d.off("update", sendUpdate);
      a.off("update", sendAwareness);
    };
    // The callbacks are the phone's own and stay the same for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    awareness.current.setLocalStateField("user", person);
  }, [person.name, person.color]);

  // The editor: built once, on the document.
  useEffect(() => {
    if (!host.current) return;
    const fragment = doc.current.getXmlFragment("default");
    const report = (e: EditorView) => {
      const a = active(e.state);
      const state: PhoneEditorState = {
        focused: focused.current,
        on: {
          bold: a.bold,
          italic: a.italic,
          underline: a.underline,
          strike: a.strike,
          code: a.code,
          highlight: a.highlight,
          h1: a.heading === 1,
          h2: a.heading === 2,
          bullets: a.bullets,
          numbers: a.numbers,
          tasks: a.tasks,
          quote: a.quote,
        },
      };
      void onState(JSON.stringify(state));
      if (focused.current) {
        const caret = e.coordsAtPos(e.state.selection.head);
        void onCaret(caret.bottom + window.scrollY);
        const trigger = editableRef.current ? triggerAt(e.state) : null;
        setMenu(
          trigger
            ? {
                trigger,
                left: Math.max(0, Math.min(caret.left, window.innerWidth - 240)),
                top: caret.bottom + window.scrollY + 4,
              }
            : null,
        );
      } else {
        setMenu(null);
      }
    };
    const editor = new EditorView(host.current, {
      state: EditorState.create({
        schema: pageSchema,
        plugins: [
          ySyncPlugin(fragment),
          yCursorPlugin(awareness.current, {
            cursorBuilder: (user: { name?: string; color?: string }) => {
              const caret = document.createElement("span");
              caret.className = "ProseMirror-yjs-cursor";
              caret.style.borderColor = user.color ?? "#64748b";
              const label = document.createElement("div");
              label.style.background = user.color ?? "#64748b";
              label.textContent = user.name ?? "Someone";
              caret.append(label);
              return caret;
            },
          }),
          yUndoPlugin(),
          markdownRules,
          typingKeys,
          keymap({ "Mod-z": undo, "Mod-y": redo, "Shift-Mod-z": redo }),
          keymap(baseKeymap),
          blockIds,
          dropCursor(),
          gapCursor(),
        ],
      }),
      nodeViews: {
        inlineMath: inlineMathView(() => macrosRef.current),
        math: mathBlockView(() => macrosRef.current),
        equation: mathBlockView(() => macrosRef.current),
      },
      attributes: { class: "pm", "data-placeholder": placeholder, spellcheck: "true" },
      editable: () => editableRef.current,
      // A tap on a formula in the text opens its source to change.
      handleClickOn(
        _view: EditorView,
        _pos: number,
        node: ProseNode,
        nodePos: number,
        event: MouseEvent,
      ) {
        if (node.type.name !== "inlineMath" || !editableRef.current) return false;
        const target = event.target instanceof HTMLElement ? event.target : null;
        const box = target?.closest(".math")?.getBoundingClientRect();
        setMathEdit({
          pos: nodePos,
          latex: String(node.attrs.latex ?? ""),
          top: (box?.bottom ?? event.clientY) + 6,
          left: Math.max(8, (box?.left ?? event.clientX) - 8),
        });
        return true;
      },
      handleClick(e: EditorView, pos: number, event: MouseEvent) {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const link = target?.closest("a");
        if (link?.getAttribute("href")) {
          event.preventDefault();
          void onOpen(link.getAttribute("href") ?? "");
          return true;
        }
        const item = target?.closest("li.task");
        if (item && editableRef.current) {
          const box = item.getBoundingClientRect();
          // The box is drawn in the item's left margin: a tap there checks it.
          if (event.clientX - box.left < 28) {
            const tr = toggleTaskAt(e.state, pos);
            if (tr) {
              e.dispatch(tr);
              return true;
            }
          }
        }
        return false;
      },
      // The plugins dispatch while the view is still being made: `this` is the view.
      dispatchTransaction(this: EditorView, tr) {
        this.updateState(this.state.apply(tr));
        if (view.current) report(this);
      },
    });
    view.current = editor;
    const focusIn = () => {
      focused.current = true;
      report(editor);
    };
    const focusOut = () => {
      focused.current = false;
      report(editor);
    };
    editor.dom.addEventListener("focus", focusIn);
    editor.dom.addEventListener("blur", focusOut);
    return () => {
      editor.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Items to mention, found for what is typed after the `@`.
  const mentionQuery = menu?.trigger.kind === "mention" ? menu.trigger.query : null;
  useEffect(() => {
    if (mentionQuery === null) {
      setFound([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void onSearch(mentionQuery).then((json) => {
        if (live) setFound(JSON.parse(json));
      });
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // `onSearch` is the phone's own and stays the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionQuery]);

  const choose = (apply: (e: EditorView, trigger: Trigger) => void) => {
    const editor = view.current;
    if (editor && menu) apply(editor, menu.trigger);
    setMenu(null);
    editor?.focus();
  };

  // End to end checks only: scripts run in this web view too, to type into the editor.
  useEffect(() => {
    const url = process.env.EXPO_PUBLIC_AUTOMATION_URL;
    if (!url) return;
    let stop: (() => void) | undefined;
    void import("../dev/automation.ts").then(({ startAutomation }) => {
      stop = startAutomation(url, `${automationDevice}-editor`, {
        editor: view.current,
        doc: doc.current,
        awareness: awareness.current,
      });
    });
    return () => stop?.();
  }, []);

  const editableRef = useRef(editable);
  const macrosRef = useRef(macros);
  macrosRef.current = macros;
  /// The formula being edited: where it is in the page, its source, and where it sits.
  const [mathEdit, setMathEdit] = useState<{
    pos: number;
    latex: string;
    top: number;
    left: number;
  } | null>(null);
  editableRef.current = editable;
  useEffect(() => {
    view.current?.setProps({ editable: () => editable });
  }, [editable]);

  // SAFETY: custom properties are valid style keys; React's type only lists the known ones.
  const vars = {
    "--fg": colors.foreground,
    "--bg": colors.background,
    "--muted": colors.muted,
    "--border": colors.border,
    "--primary": colors.primary,
  } as React.CSSProperties;

  return (
    <div className="root" style={vars}>
      <style>{CSS}</style>
      <style>{highlightCss(".pm", colors.dark)}</style>
      <div ref={host} />
      {mathEdit ? (
        <form
          className="menu"
          aria-label="Formula"
          style={{ left: mathEdit.left, top: mathEdit.top, width: 280 }}
          onSubmit={(event) => {
            event.preventDefault();
            const editor = view.current;
            if (editor) {
              editor.dispatch(
                editor.state.tr.setNodeMarkup(mathEdit.pos, undefined, { latex: mathEdit.latex }),
              );
              editor.focus();
            }
            setMathEdit(null);
          }}
        >
          <input
            aria-label="LaTeX"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            value={mathEdit.latex}
            onChange={(event) => setMathEdit({ ...mathEdit, latex: event.target.value })}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: "100%",
              boxSizing: "border-box",
              font: "15px ui-monospace, Menlo, monospace",
            }}
          />
        </form>
      ) : null}
      {menu ? (
        <div
          className="menu"
          role="listbox"
          aria-label={menu.trigger.kind === "slash" ? "Blocks" : "Items to mention"}
          style={{ left: menu.left, top: menu.top }}
        >
          {menu.trigger.kind === "slash"
            ? slashMatches(menu.trigger.query).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  // Keeps the selection and the keyboard where they are.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    choose((e, trigger) => {
                      const tr = applySlash(e.state, trigger, item);
                      if (tr) e.dispatch(tr);
                    })
                  }
                >
                  {item.label}
                </button>
              ))
            : found.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    choose((e, trigger) => e.dispatch(applyMention(e.state, trigger, item)))
                  }
                >
                  {item.title || "Untitled"}
                  <small>{item.key}</small>
                </button>
              ))}
          {menu.trigger.kind === "mention" && found.length === 0 ? <p>No items found</p> : null}
          {menu.trigger.kind === "slash" && slashMatches(menu.trigger.query).length === 0 ? (
            <p>No blocks match</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
