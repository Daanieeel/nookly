import { createPage, createSpace, listBlocks } from "@nookly/shared/data";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { Activity, type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import * as Y from "yjs";
import { EditorStandIn } from "../test/editor-stand-in.tsx";
import { renderScreens, testData } from "../test/render.tsx";
import { fromBase64 } from "./bridge.ts";
import { PageEditorViewProvider, type PageEditorViewProps } from "./editor-view.tsx";
import { PageDocEditor } from "./LivePage.tsx";
import { RowsPage } from "./RowsPage.tsx";
import type { EditorHandle } from "./PageEditorDom.tsx";

/// The web view's document: what the phone sent it.
const shown = new Y.Doc();

/// The web view as it behaves: it says it is ready once, when it has loaded, and stays
/// loaded while the page is out of sight.
function WebViewStandIn(given: Partial<PageEditorViewProps> & { ref?: Ref<EditorHandle> }) {
  const loaded = useRef(false);
  useImperativeHandle(given.ref, () => ({
    applyUpdate: (update: string) => Y.applyUpdate(shown, fromBase64(update)),
    applyAwareness: () => {},
    run: () => {},
    closeVimHelp: () => {},
    setCodeLanguage: () => {},
    find: () => {},
    findStep: () => {},
  }));
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    // It loads after the page has drawn, as a web view does.
    setTimeout(() => void given.onReady?.(), 0);
  });
  return <View accessibilityLabel="Page editor" />;
}

let setVisible: (visible: boolean) => void = () => {};

function Tab({ doc }: { doc: Y.Doc }) {
  const [visible, set] = useState(true);
  setVisible = set;
  return (
    // SAFETY: the stand in takes the props it uses; the rest of the editor's are ignored.
    <PageEditorViewProvider value={WebViewStandIn as never}>
      <Activity mode={visible ? "visible" : "hidden"}>
        <PageDocEditor doc={doc} awareness={null} entityId="a" editable fill={false} />
      </Activity>
    </PageEditorViewProvider>
  );
}

const text = (doc: Y.Doc) => doc.getText("probe").toString();

// A tablet keeps a tab out of sight paused (React's `Activity`): its effects stop and start
// again, but its web view stays loaded and never says it is ready a second time. Edits from
// another device then stopped reaching the editor of a page shown again.
describe("a live page in a tab kept out of sight", () => {
  it("shows what arrived meanwhile, and keeps following edits, once shown again", async () => {
    const doc = new Y.Doc();
    await renderScreens({ index: () => <Tab doc={doc} /> }, testData());
    act(() => doc.getText("probe").insert(0, "a"));
    await waitFor(() => expect(text(shown)).toBe("a"));
    act(() => setVisible(false));
    act(() => doc.getText("probe").insert(1, "b"));
    act(() => setVisible(true));
    await waitFor(() => expect(text(shown)).toBe("ab"));
    act(() => doc.getText("probe").insert(2, "c"));
    await waitFor(() => expect(text(shown)).toBe("abc"));
  });
});

let loads = 0;

/// The stand in for the web view, counting how often it is loaded.
function CountingStandIn(props: PageEditorViewProps) {
  // Once a mount: a paused tab runs its effects again, but keeps its state.
  useState(() => {
    loads += 1;
    return null;
  });
  return <EditorStandIn {...props} />;
}

function RowsTab({ entityId }: { entityId: string }) {
  const [visible, set] = useState(true);
  setVisible = set;
  return (
    <PageEditorViewProvider value={CountingStandIn}>
      <Activity mode={visible ? "visible" : "hidden"}>
        <RowsPage entityId={entityId} editable fill={false} />
      </Activity>
    </PageEditorViewProvider>
  );
}

// A page kept only on this device was opened again from its rows each time its tab showed,
// loading its editor again, and possibly before what was typed just before had been written.
describe("a page of rows in a tab kept out of sight", () => {
  it("writes what was typed, and shows the same editor again", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Work", "#0070f3");
    const page = await createPage(data.db, space, "note", "Plans");
    loads = 0;
    const screen = await renderScreens({ index: () => <RowsTab entityId={page} /> }, data);
    const field = await screen.findByLabelText("Page editor");
    await fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "Before hiding");
    act(() => setVisible(false));
    act(() => setVisible(true));
    await waitFor(async () =>
      expect(JSON.stringify(await listBlocks(data.db, page))).toContain("Before hiding"),
    );
    expect(screen.getByLabelText("Page editor")).toBe(field);
    expect(loads).toBe(1);
    await fireEvent.changeText(screen.UNSAFE_getByType(TextInput), "After showing");
    await waitFor(
      async () =>
        expect(JSON.stringify(await listBlocks(data.db, page))).toContain("After showing"),
      { timeout: 3000 },
    );
  });
});
