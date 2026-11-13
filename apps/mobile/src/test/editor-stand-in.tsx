import { PAGE_FRAGMENT, insertNodes } from "@nookly/shared/blocks";
import { useEffect, useImperativeHandle, useRef } from "react";
import { TextInput, View } from "react-native";
import * as Y from "yjs";
import { fromBase64, toBase64 } from "../editor/bridge.ts";
import type { PageEditorViewProps } from "../editor/editor-view.tsx";

let typed = 0;

/// What stands in for the page editor's web view, which a test can not run: a document of
/// its own kept in step with the phone's, as the web view's is, and a text box (named by
/// the editor's placeholder) whose text becomes the page, a paragraph per line.
export function EditorStandIn({ ref, placeholder, onReady, onUpdate }: PageEditorViewProps) {
  const doc = useRef(new Y.Doc());
  useImperativeHandle(ref, () => ({
    applyUpdate: (update: string) => Y.applyUpdate(doc.current, fromBase64(update), "phone"),
    applyAwareness: () => {},
    run: () => {},
    closeVimHelp: () => {},
    setCodeLanguage: () => {},
  }));
  useEffect(() => {
    void onReady();
  }, [onReady]);
  const type = (text: string) => {
    const before = Y.encodeStateVector(doc.current);
    doc.current.transact(() => {
      const fragment = doc.current.getXmlFragment(PAGE_FRAGMENT);
      fragment.delete(0, fragment.length);
      insertNodes(
        fragment,
        0,
        text.split("\n").map((line) => ({
          type: "paragraph",
          attrs: { blockId: `typed-${++typed}` },
          content: line ? [{ type: "text", text: line }] : undefined,
        })),
      );
    });
    void onUpdate(toBase64(Y.encodeStateAsUpdate(doc.current, before)));
  };
  return (
    <View accessibilityLabel="Page editor">
      <TextInput accessibilityLabel={placeholder} onChangeText={type} />
    </View>
  );
}
