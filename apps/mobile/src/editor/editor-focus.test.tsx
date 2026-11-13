import { router } from "expo-router";
import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { type Ref, useImperativeHandle } from "react";
import { Text, View } from "react-native";
import * as Y from "yjs";
import { renderScreens, testData } from "../test/render.tsx";
import { PageEditorViewProvider } from "./editor-view.tsx";
import { PageDocEditor } from "./LivePage.tsx";
import type { EditorHandle } from "./PageEditorDom.tsx";
import type { PageEditorViewProps as EditorViewProps } from "./editor-view.tsx";

const ran: string[] = [];
let props: Pick<EditorViewProps, "onPickLanguage" | "onCopy"> | null = null;

/// The web view's stand in, keeping what the page asked of it.
function RecordingEditor(given: Partial<EditorViewProps> & { ref?: Ref<EditorHandle> }) {
  useImperativeHandle(given.ref, () => {
    props = { onPickLanguage: given.onPickLanguage!, onCopy: given.onCopy! };
    return {
      applyUpdate: () => {},
      applyAwareness: () => {},
      run: (id: string) => {
        ran.push(id);
      },
      closeVimHelp: () => {},
      setCodeLanguage: (pos: number, language: string) => {
        ran.push(`language ${pos} ${language}`);
      },
    };
  });
  return <View accessibilityLabel="Page editor" />;
}

const editor = () => (
  // SAFETY: the stand in takes the props it uses; the rest of the editor's are ignored.
  <PageEditorViewProvider value={RecordingEditor as never}>
    <PageDocEditor doc={new Y.Doc()} awareness={null} entityId="a" editable fill={false} />
  </PageEditorViewProvider>
);

describe("a page's editor", () => {
  // A page opened from another kept its editor under it in the stack, still holding the
  // keyboard, so the editor's toolbar showed over the new page.
  it("lets go of the keyboard when another page opens over it", async () => {
    ran.length = 0;
    const screen = await renderScreens(
      { index: editor, next: () => <Text>Next page</Text> },
      testData(),
    );
    expect(await screen.findByLabelText("Page editor")).toBeTruthy();
    expect(ran).toEqual([]);
    act(() => router.push("/next"));
    await waitFor(() => expect(ran).toEqual(["done"]));
  });

  it("picks a code block's language from the phone's sheet, as the desktop's list", async () => {
    ran.length = 0;
    const screen = await renderScreens({ index: editor }, testData());
    await screen.findByLabelText("Page editor");
    await act(() => props?.onPickLanguage(12, "plaintext"));
    await fireEvent.press(await screen.findByRole("radio", { name: "Python" }));
    await waitFor(() => expect(ran).toContain("language 12 python"));
  });

  it("copies a code block's code to the clipboard", async () => {
    const copy = jest.fn(async () => {});
    const screen = await renderScreens({ index: editor }, testData(), "/", {
      clipboard: { copy },
    });
    await screen.findByLabelText("Page editor");
    await act(() => props?.onCopy("print(1)"));
    expect(copy).toHaveBeenCalledWith("print(1)");
  });
});
