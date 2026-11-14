import { type PageSession, caretColor, presenceName } from "@nookly/shared/sync";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { type Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { recents, search } from "@nookly/shared/data";
import { useFocusEffect, useRouter } from "expo-router";
import { Linking } from "react-native";
import { useAppData, useSyncState } from "../data/context.tsx";
import { automationDevice } from "../dev/device.ts";
import { deviceName } from "../data/sync.ts";
import { parseLatexMacros } from "@nookly/shared/latex";
import { useSetting } from "../data/settings.ts";
import { pageTypographyCss } from "./typography.ts";
import { useReveal } from "../ui/Screen.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { VimKeys } from "./VimKeys.tsx";
import { useClipboard } from "../ui/clipboard.tsx";
import { haptic } from "../ui/haptics.ts";
import { CODE_LANGUAGE_OPTIONS } from "../ui/LanguageMark.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { useOptionalSheetHost } from "../ui/sheet/SheetHost.tsx";
import { useTheme } from "../ui/theme.ts";
import { type AwarenessChanges, type Origin, fromBase64, toBase64 } from "./bridge.ts";
import type { EditorHandle } from "./PageEditorDom.tsx";
import { runOn } from "./handle.ts";
import { usePageEditorView } from "./editor-view.tsx";
import { type EditorAction, editorStateSchema } from "./toolbar.ts";
import { useToolbar } from "./toolbar-store.ts";

/// How tall an item's description is at least: the region a tap starts typing in.
const DESCRIPTION_HEIGHT = 160;

/// The marker for updates that came from the web view, so they are not sent back.
const FROM_EDITOR = "editor";

/// A page as a live document: the editor in a web view, kept in step with the phone's
/// copy of the document (offline copy, socket to the server) by swapping Yjs updates.
export function LivePage({
  session,
  editable,
  fill,
}: {
  session: PageSession;
  editable: boolean;
  fill: boolean;
}) {
  return (
    <PageDocEditor
      // A page opened again is another document object: the editor starts over on it.
      key={session.doc.guid}
      doc={session.doc}
      awareness={session.provider.awareness ?? null}
      entityId={session.entityId}
      editable={editable}
      fill={fill}
    />
  );
}

/// The page editor on a page document: the live one from the server, or one kept only on
/// this phone (`RowsPage`), with who else is here when it is live.
export function PageDocEditor({
  doc: pageDoc,
  awareness: pageAwareness,
  entityId,
  editable,
  fill,
  placeholder = "Write something",
}: {
  doc: Y.Doc;
  awareness: Awareness | null;
  entityId: string;
  editable: boolean;
  /// What an empty page says (a card's face: "The question").
  placeholder?: string;
  /// Whether the editor reaches down to the bottom of the screen, so a tap anywhere below
  /// the text starts typing; else it is a region of the page.
  fill: boolean;
}) {
  const EditorView = usePageEditorView();
  const theme = useTheme();
  const reveal = useReveal();
  const handle = useRef<EditorHandle>(null);
  const anchor = useRef<View>(null);
  const ready = useRef(false);
  const user = useSyncState((s) => s.user);
  const [displayName] = useSetting("general.displayName");
  const [macroText] = useSetting("notes.latexMacros");
  const [vim] = useSetting("notes.vimMode");
  const [pageFont] = useSetting("notes.editorFont");
  const [pageSize] = useSetting("notes.editorFontSize");
  /// `?` in Vim's normal mode asked for the key list.
  const [vimHelp, setVimHelp] = useState(false);
  const macros = useMemo(() => parseLatexMacros(macroText).macros, [macroText]);
  const name = presenceName(displayName.trim() || user?.username || "Someone", deviceName());
  const person = { name, color: caretColor(user?.id ?? name) };
  const toolbar = useToolbar();
  const { db } = useAppData();
  const window = useWindowDimensions();
  /// Where the editor starts on the screen, for the room left under it.
  const [top, setTop] = useState<number | null>(null);
  const minHeight =
    fill && top !== null
      ? Math.max(DESCRIPTION_HEIGHT, window.height - top - 120)
      : DESCRIPTION_HEIGHT;
  const router = useRouter();
  const host = useOptionalSheetHost();
  const clipboard = useClipboard();

  // Edits made elsewhere reach the editor as they arrive.
  useEffect(() => {
    ready.current = false;
    const doc = pageDoc;
    const awareness = pageAwareness;
    const sendUpdate = (update: Uint8Array, origin: Origin) => {
      if (origin !== FROM_EDITOR && ready.current) {
        handle.current?.applyUpdate(toBase64(update));
      }
    };
    const sendAwareness = (change: AwarenessChanges, origin: Origin) => {
      if (origin === FROM_EDITOR || !ready.current || !awareness) return;
      const ids = [...change.added, ...change.updated, ...change.removed];
      handle.current?.applyAwareness(toBase64(encodeAwarenessUpdate(awareness, ids)));
    };
    doc.on("update", sendUpdate);
    awareness?.on("update", sendAwareness);
    return () => {
      doc.off("update", sendUpdate);
      awareness?.off("update", sendAwareness);
      toolbar.clear();
    };
    // `toolbar.clear` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageDoc, pageAwareness]);

  // A page opened over this one, or going back from it: the editor lets go of the keyboard,
  // so its toolbar never shows over another page.
  useFocusEffect(
    useCallback(
      () => () => {
        // The toolbar goes with the keyboard at once, not when the editor reports back.
        toolbar.clear();
        runOn(handle.current, "done");
      },
      [],
    ),
  );

  const onReady = useCallback(async () => {
    // The editor starts from the whole document, and from who else is here.
    handle.current?.applyUpdate(toBase64(Y.encodeStateAsUpdate(pageDoc)));
    const awareness = pageAwareness;
    if (awareness) {
      handle.current?.applyAwareness(
        toBase64(encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()])),
      );
    }
    ready.current = true;
  }, [pageDoc, pageAwareness]);

  const onUpdate = useCallback(
    async (update: string) => {
      Y.applyUpdate(pageDoc, fromBase64(update), FROM_EDITOR);
    },
    [pageDoc],
  );

  const onAwareness = useCallback(
    async (update: string) => {
      const awareness = pageAwareness;
      if (awareness) applyAwarenessUpdate(awareness, fromBase64(update), FROM_EDITOR);
    },
    [pageAwareness],
  );

  const onState = useCallback(
    async (json: string) => {
      const state = editorStateSchema.parse(JSON.parse(json));
      toolbar.set(state, (id: EditorAction) => runOn(handle.current, id));
      setVimHelp(state.vimHelp ?? false);
    },
    // `toolbar.set` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onCaret = useCallback(
    async (bottom: number) => {
      if (anchor.current) reveal?.(anchor.current, bottom);
    },
    [reveal],
  );

  /// Items to mention: what matches what was typed, or the ones opened last.
  const onSearch = useCallback(
    async (query: string) => {
      const items = query.trim() ? await search(db, query, 8) : await recents(db, 8);
      return JSON.stringify(
        items
          .filter((e) => e.id !== entityId)
          .map((e) => ({ id: e.id, title: e.title, key: e.key })),
      );
    },
    [db, entityId],
  );

  /// A mention opens the item; a web address opens in the browser.
  const onOpen = useCallback(
    async (href: string) => {
      if (href.startsWith("mention:")) {
        router.push(`/entity/${href.slice("mention:".length).split("#")[0]}`);
      } else if (/^https?:\/\//.test(href)) {
        await Linking.openURL(href);
      }
    },
    [router],
  );

  /// A code block's language, picked from the phone's sheet of the desktop's languages.
  const onPickLanguage = useCallback(
    async (pos: number, language: string) => {
      host?.present({
        title: "Language",
        size: "large",
        content: (
          <OptionList
            label="Language"
            searchPlaceholder="Search languages"
            options={CODE_LANGUAGE_OPTIONS}
            value={language}
            onChange={(next) => handle.current?.setCodeLanguage(pos, next)}
          />
        ),
      });
    },
    [host],
  );

  const onCopy = useCallback(
    async (text: string) => {
      await clipboard.copy(text);
      haptic("success");
    },
    [clipboard],
  );

  return (
    <View
      ref={anchor}
      collapsable={false}
      style={{ minHeight }}
      onLayout={() => anchor.current?.measureInWindow((_x, y) => setTop(y))}
    >
      <EditorView
        ref={handle}
        // The system's bar over the keyboard (up, down, done) gives way to the app's toolbar.
        dom={{
          matchContents: true,
          useExpoDOMWebView: true,
          scrollEnabled: false,
          hideKeyboardAccessoryView: true,
        }}
        editable={editable}
        vim={vim}
        typography={pageTypographyCss(pageFont, pageSize, window.fontScale)}
        person={person}
        macros={macros}
        placeholder={placeholder}
        minHeight={minHeight}
        colors={{
          foreground: theme.colors.foreground,
          background: theme.colors.page,
          muted: theme.colors.mutedForeground,
          border: theme.colors.border,
          primary: theme.colors.primary,
          dark: theme.dark,
          accents: {
            pink: theme.colors.accentPink,
            green: theme.colors.positive,
            purple: theme.colors.accentPurple,
            blue: theme.colors.accentBlue,
            yellow: theme.colors.caution,
          },
        }}
        onReady={onReady}
        onUpdate={onUpdate}
        onAwareness={onAwareness}
        onState={onState}
        onCaret={onCaret}
        automationDevice={automationDevice()}
        onSearch={onSearch}
        onOpen={onOpen}
        onPickLanguage={onPickLanguage}
        onCopy={onCopy}
      />
      <Sheet
        open={vimHelp}
        onOpenChange={(open) => {
          if (!open) handle.current?.closeVimHelp();
        }}
        title="Vim keys"
      >
        <VimKeys />
      </Sheet>
    </View>
  );
}
