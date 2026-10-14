"use dom";
/// <reference lib="dom" />

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
import { type Command, EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { type Ref, useEffect, useRef } from "react";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { type AwarenessChanges, type Origin, fromBase64, toBase64 } from "./bridge.ts";
import type { EditorState as PhoneEditorState, ToolbarId } from "./toolbar.ts";
import {
  active,
  blockIds,
  indent,
  markdownRules,
  outdent,
  toggleBold,
  toggleBullets,
  toggleCode,
  toggleHeading,
  toggleItalic,
  toggleNumbers,
  toggleQuote,
  toggleStrike,
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
}

interface Props {
  ref: Ref<EditorHandle>;
  dom?: DOMProps;
  editable: boolean;
  person: { name: string; color: string };
  colors: EditorColors;
  placeholder: string;
  /// The web view has started: the phone answers with the document so far.
  onReady: () => Promise<void>;
  onUpdate: (update: string) => Promise<void>;
  onAwareness: (update: string) => Promise<void>;
  /// Whether the editor has the keyboard and which formats are on, as JSON.
  onState: (state: string) => Promise<void>;
  /// Where the cursor's line ends, from the top of the editor, so the page can scroll to it.
  onCaret: (bottom: number) => Promise<void>;
}

const COMMANDS = {
  bold: toggleBold,
  italic: toggleItalic,
  underline: toggleUnderline,
  strike: toggleStrike,
  code: toggleCode,
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
.pm mark { background: color-mix(in srgb, #facc15 45%, transparent); color: inherit; border-radius: 3px; }
.pm a { color: var(--primary); }
.pm hr { border: 0; border-top: 1px solid var(--border); margin: 1em 0; }
.pm table { border-collapse: collapse; margin: 0 0 .6em; width: 100%; }
.pm td, .pm th { border: 1px solid var(--border); padding: .35em .5em; vertical-align: top; }
.pm .callout { margin: 0 0 .6em; padding: .7em .8em; border-radius: 8px; border: 1px solid var(--border); background: color-mix(in srgb, var(--primary) 8%, transparent); }
.pm .toggle { margin: 0 0 .6em; padding-left: .9em; border-left: 3px solid var(--border); }
.pm .card { margin: 0 0 .6em; padding: .7em .8em; border-radius: 8px; border: 1px solid var(--border); color: var(--muted); font-size: .9em; user-select: none; }
.pm .math { font-family: ui-monospace, Menlo, monospace; color: var(--muted); }
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
  placeholder,
  onReady,
  onUpdate,
  onAwareness,
  onState,
  onCaret,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const doc = useRef(new Y.Doc());
  const awareness = useRef(new Awareness(doc.current));
  const focused = useRef(false);

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
      attributes: { class: "pm", "data-placeholder": placeholder, spellcheck: "true" },
      editable: () => editableRef.current,
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

  // End to end checks only: scripts run in this web view too, to type into the editor.
  useEffect(() => {
    const url = process.env.EXPO_PUBLIC_AUTOMATION_URL;
    if (!url) return;
    let stop: (() => void) | undefined;
    void import("../dev/automation.ts").then(({ startAutomation }) => {
      const device = process.env.EXPO_PUBLIC_AUTOMATION_DEVICE ?? "phone";
      stop = startAutomation(url, `${device}-editor`, {
        editor: view.current,
        doc: doc.current,
        awareness: awareness.current,
      });
    });
    return () => stop?.();
  }, []);

  const editableRef = useRef(editable);
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
      <div ref={host} />
    </div>
  );
}
