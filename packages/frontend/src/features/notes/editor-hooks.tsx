import { useQuery } from "@tanstack/react-query";
import { Selection } from "@tiptap/pm/state";
import type { EditorProps } from "@tiptap/pm/view";
import { type Editor, EditorContent } from "@tiptap/react";
import { type ReactNode, useEffect, useRef } from "react";
import { contextTargetAt, makeTarget } from "#/components/context-menu/registry.ts";
import { useTabGroupScope } from "#/components/tab-group-scope.ts";
import { hasPages } from "#/features/files/file-kind.ts";
import { listEntities } from "#/lib/api/entities.ts";
import { listFiles } from "#/lib/api/files.ts";
import { getNoteCodeLanguage } from "#/lib/api/notes.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import type { SessionOccurrence } from "#/lib/api/types.ts";
import { qk } from "#/lib/query-keys.ts";
import { focusBlockIn, useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { asString } from "./block-markdown";
import { BlockHandles, GUTTER_WIDTH, findTopLevelBlock, topLevelElement } from "./BlockHandles";
import { newCodeBlockLanguage } from "./default-code-language";
import type { EditorExtensionOptions } from "./editor-extensions";
import { type PageSection, pageSections } from "./heading-anchors";
import { HighlightColorBar } from "./HighlightColorBar";
import { openLink } from "./open-link";
import type { usePasteFiles } from "./paste-files";
import { TableColumnHandles } from "./TableColumnHandles";
import { TableControls } from "./TableControls";
import { TableRowHandles } from "./TableRowHandles";
import { VimIndicator } from "./VimIndicator";

/// The parts of a page editor that don't depend on where its document lives: what
/// its extensions read, the headings it reports, a block it was asked to show, the
/// context menu and the controls around it. Shared by the editor that saves rows
/// (`BlockEditor`) and the live one (`CollaborativeEditor`).

/// What the editor's extensions read live: the Space's entities for mentions, files
/// shown by page, sessions by day and time, and the note's own code language.
export function useEditorLookups(
  spaceId: string,
  entityId: string,
): Omit<EditorExtensionOptions, "spaceId" | "pageId"> {
  const { data: entities = [] } = useQuery({
    queryKey: qk.entities.bySpace(spaceId),
    queryFn: () => listEntities(spaceId, false),
  });
  const entitiesRef = useRef(entities);
  entitiesRef.current = entities;
  // Which files are shown page by page, so a mention of one can name a page.
  const { data: files = [] } = useQuery({
    queryKey: qk.files.bySpace(spaceId),
    queryFn: () => listFiles(spaceId),
  });
  // A session is found by its day and time as well as its course, which is its title.
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions.bySpace(spaceId),
    queryFn: () => listSessions(spaceId),
  });
  const sessionsById = useRef(new Map<string, SessionOccurrence>());
  sessionsById.current = new Map(sessions.map((s) => [s.entity.id, s]));
  const pagedFileIds = useRef(new Set<string>());
  pagedFileIds.current = new Set(files.filter(hasPages).map((f) => f.entity.id));
  // The note's own code language, read live when a code block is made. A Jot has none.
  const { data: noteCodeLanguage = null } = useQuery({
    queryKey: qk.noteCodeLanguage(entityId),
    queryFn: () => getNoteCodeLanguage(entityId),
  });
  const noteCodeLanguageRef = useRef(noteCodeLanguage);
  noteCodeLanguageRef.current = noteCodeLanguage;
  const options = useRef<Omit<EditorExtensionOptions, "spaceId" | "pageId">>({
    getEntities: () => entitiesRef.current,
    hasPages: (entity) => pagedFileIds.current.has(entity.id),
    sessionOf: (entity) => sessionsById.current.get(entity.id),
    getNewCodeLanguage: () => newCodeBlockLanguage(noteCodeLanguageRef.current),
  });
  return options.current;
}

/// The editor's DOM props: the page canvas, pasting files and opening links.
export function pageEditorProps({
  compact,
  scrollPastEnd,
  spaceId,
  pasteFiles,
}: {
  compact: boolean;
  scrollPastEnd: boolean;
  spaceId: string;
  pasteFiles: ReturnType<typeof usePasteFiles>;
}): EditorProps {
  return {
    attributes: {
      class: cn("tiptap-content text-sm/relaxed", !compact && "min-h-40"),
      ...(scrollPastEnd && { style: "padding-bottom: 100vh" }),
    },
    handlePaste: (view, event) => pasteFiles.handlePaste(view, event),
    handleClickOn: (_view, _pos, _node, _nodePos, event) => openLink(event, spaceId),
  };
}

/// Reports the headings after every change to the document, including edits pulled
/// in from outside, but only when the outline itself changed.
export function useSectionsReport(
  editor: Editor | null,
  onSectionsChange: ((sections: PageSection[]) => void) | undefined,
) {
  const onSectionsChangeRef = useRef(onSectionsChange);
  onSectionsChangeRef.current = onSectionsChange;
  useEffect(() => {
    if (!editor) return;
    let last = "";
    const report = () => {
      const sections = pageSections(editor.state.doc);
      const key = JSON.stringify(sections);
      if (key === last) return;
      last = key;
      onSectionsChangeRef.current?.(sections);
    };
    report();
    editor.on("transaction", report);
    return () => {
      editor.off("transaction", report);
    };
  }, [editor]);
}

/// Scrolls to a block requested from outside (a block level search result) once the
/// page is in, then hands the request back. `toClientId` maps a stored block id to
/// the id it has in this editor.
export function useFocusBlockRequest(
  editor: Editor | null,
  entityId: string,
  toClientId: (blockId: string) => string,
) {
  const { groupId } = useTabGroupScope();
  const focusBlock = useNavStore((s) => focusBlockIn(s, groupId));
  const clearFocusBlock = useNavStore((s) => s.clearFocusBlock);
  const toClientIdRef = useRef(toClientId);
  toClientIdRef.current = toClientId;
  useEffect(() => {
    // A page of a file is for the file viewer, not for a page's editor.
    if (!editor || focusBlock?.entityId !== entityId || !focusBlock.blockId) return;
    const clientId = toClientIdRef.current(focusBlock.blockId);
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    /// Found through the document rather than a `[data-block-id]` query: node
    /// view blocks (code blocks, tables) don't carry node attrs onto their DOM.
    function locate(): { element: HTMLElement; pos: number } | null {
      if (!editor) return null;
      let found: { element: HTMLElement; pos: number } | null = null;
      editor.state.doc.forEach((node, pos) => {
        if (found || node.attrs.blockId !== clientId) return;
        const dom = editor.view.nodeDOM(pos);
        if (dom instanceof HTMLElement && dom.isConnected) found = { element: dom, pos };
      });
      return found;
    }

    function attempt() {
      if (!editor) return;
      const target = locate();
      if (!target) {
        // The node may not be rendered yet; give up after about half a second.
        if (tries++ < 30) frame = requestAnimationFrame(attempt);
        else clearFocusBlock();
        return;
      }
      const { element, pos } = target;
      element.scrollIntoView({ block: "center" });
      element.animate(
        [
          { backgroundColor: "color-mix(in oklab, var(--primary) 16%, transparent)" },
          { backgroundColor: "transparent" },
        ],
        { duration: 1800, easing: "ease-out" },
      );
      // Re-center once late layout (syntax highlighting, images) has settled,
      // and only place the cursor after the closing overlay released focus.
      settle = setTimeout(() => {
        clearFocusBlock();
        if (!element.isConnected) return;
        element.scrollIntoView({ block: "center" });
        // `Selection.near` finds the first text position inside the block, which
        // for a table is its first cell rather than the table node itself.
        const { state } = editor.view;
        const start = Math.min(pos + 1, state.doc.content.size);
        editor.view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(start))));
        editor.commands.focus(null, { scrollIntoView: false });
      }, 300);
    }

    frame = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [editor, focusBlock, entityId, clearFocusBlock]);
}

/// The editor with its controls around it. Right clicking a block, or the gutter
/// beside it, targets that block; the rest of the canvas targets the page as a whole.
export function EditorFrame({
  editor,
  entityId,
  resolveStoredId,
  extra,
  children,
}: {
  editor: Editor | null;
  entityId: string;
  /// The stored id of a block, which is what a link to it has to point at.
  resolveStoredId: (blockId: string) => Promise<string | null>;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const blockContextTarget = contextTargetAt((event) => {
    if (!editor) return undefined;
    const dom = editor.view.dom;
    const box = dom.getBoundingClientRect();
    const inGutter = event.clientX >= box.left && event.clientX < box.left + GUTTER_WIDTH;
    const probed = inGutter
      ? document.elementFromPoint(box.left + GUTTER_WIDTH + 1, event.clientY)
      : event.target instanceof Element
        ? event.target
        : null;
    const element = topLevelElement(dom, probed);
    const block = element && findTopLevelBlock(editor.view, element);
    const blockId = block ? asString(block.node.attrs.blockId) : undefined;
    return blockId
      ? makeTarget("note.block", { editor, blockId, entityId, resolveStoredId })
      : makeTarget("note.canvas", {
          editor,
          overText: event.target instanceof Node && dom.contains(event.target),
        });
  });
  return (
    <div className="relative" {...blockContextTarget}>
      {children}
      <TableControls editor={editor} />
      <TableRowHandles editor={editor} />
      <TableColumnHandles editor={editor} />
      <BlockHandles editor={editor} />
      <HighlightColorBar editor={editor} />
      <EditorContent editor={editor} />
      <VimIndicator editor={editor} />
      {extra}
    </div>
  );
}
