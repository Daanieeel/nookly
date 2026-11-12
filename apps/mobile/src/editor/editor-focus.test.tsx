import { router } from "expo-router";
import { act, waitFor } from "expo-router/testing-library";
import { type Ref, useImperativeHandle } from "react";
import { Text, View } from "react-native";
import * as Y from "yjs";
import { renderScreens, testData } from "../test/render.tsx";
import { PageEditorViewProvider } from "./editor-view.tsx";
import { PageDocEditor } from "./LivePage.tsx";
import type { EditorHandle } from "./PageEditorDom.tsx";

const ran: string[] = [];

/// The web view's stand in, keeping what the page asked of it.
function RecordingEditor({ ref }: { ref?: Ref<EditorHandle> }) {
  useImperativeHandle(ref, () => ({
    applyUpdate: () => {},
    applyAwareness: () => {},
    run: (id: string) => {
      ran.push(id);
    },
    closeVimHelp: () => {},
  }));
  return <View accessibilityLabel="Page editor" />;
}

describe("a page's editor", () => {
  // A page opened from another kept its editor under it in the stack, still holding the
  // keyboard, so the editor's toolbar showed over the new page.
  it("lets go of the keyboard when another page opens over it", async () => {
    const screen = await renderScreens(
      {
        index: () => (
          // SAFETY: the stand in takes the props it uses; the rest of the editor's are ignored.
          <PageEditorViewProvider value={RecordingEditor as never}>
            <PageDocEditor doc={new Y.Doc()} awareness={null} entityId="a" editable fill={false} />
          </PageEditorViewProvider>
        ),
        next: () => <Text>Next page</Text>,
      },
      testData(),
    );
    expect(await screen.findByLabelText("Page editor")).toBeTruthy();
    expect(ran).toEqual([]);
    act(() => router.push("/next"));
    await waitFor(() => expect(ran).toEqual(["done"]));
  });
});
