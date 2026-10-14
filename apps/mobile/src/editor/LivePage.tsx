import { type PageSession, caretColor, presenceName } from "@nookly/shared/sync";
import { useCallback, useEffect, useRef } from "react";
import { View } from "react-native";
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { useSyncState } from "../data/context.tsx";
import { deviceName } from "../data/sync.ts";
import { useSetting } from "../data/settings.ts";
import { useReveal } from "../ui/Screen.tsx";
import { useTheme } from "../ui/theme.ts";
import { type AwarenessChanges, type Origin, fromBase64, toBase64 } from "./bridge.ts";
import PageEditorDom, { type EditorHandle } from "./PageEditorDom.tsx";
import { type ToolbarId, editorStateSchema } from "./toolbar.ts";
import { useToolbar } from "./toolbar-store.ts";

/// The marker for updates that came from the web view, so they are not sent back.
const FROM_EDITOR = "editor";

/// A page as a live document: the editor in a web view, kept in step with the phone's
/// copy of the document (offline copy, socket to the server) by swapping Yjs updates.
export function LivePage({ session, editable }: { session: PageSession; editable: boolean }) {
  const theme = useTheme();
  const reveal = useReveal();
  const handle = useRef<EditorHandle>(null);
  const anchor = useRef<View>(null);
  const ready = useRef(false);
  const user = useSyncState((s) => s.user);
  const [displayName] = useSetting("general.displayName");
  const name = presenceName(displayName.trim() || user?.username || "Someone", deviceName());
  const person = { name, color: caretColor(user?.id ?? name) };
  const toolbar = useToolbar();

  // Edits made elsewhere reach the editor as they arrive.
  useEffect(() => {
    ready.current = false;
    const doc = session.doc;
    const awareness = session.provider.awareness;
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
  }, [session]);

  const onReady = useCallback(async () => {
    // The editor starts from the whole document, and from who else is here.
    handle.current?.applyUpdate(toBase64(Y.encodeStateAsUpdate(session.doc)));
    const awareness = session.provider.awareness;
    if (awareness) {
      handle.current?.applyAwareness(
        toBase64(encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()])),
      );
    }
    ready.current = true;
  }, [session]);

  const onUpdate = useCallback(
    async (update: string) => {
      Y.applyUpdate(session.doc, fromBase64(update), FROM_EDITOR);
    },
    [session],
  );

  const onAwareness = useCallback(
    async (update: string) => {
      const awareness = session.provider.awareness;
      if (awareness) applyAwarenessUpdate(awareness, fromBase64(update), FROM_EDITOR);
    },
    [session],
  );

  const onState = useCallback(
    async (json: string) => {
      const state = editorStateSchema.parse(JSON.parse(json));
      toolbar.set(state, (id: ToolbarId) => handle.current?.run(id));
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

  return (
    <View ref={anchor} collapsable={false} className="min-h-40">
      <PageEditorDom
        ref={handle}
        dom={{ matchContents: true, useExpoDOMWebView: true, scrollEnabled: false }}
        editable={editable}
        person={person}
        placeholder="Write something"
        colors={{
          foreground: theme.colors.foreground,
          background: theme.colors.page,
          muted: theme.colors.mutedForeground,
          border: theme.colors.border,
          primary: theme.colors.primary,
        }}
        onReady={onReady}
        onUpdate={onUpdate}
        onAwareness={onAwareness}
        onState={onState}
        onCaret={onCaret}
      />
    </View>
  );
}
