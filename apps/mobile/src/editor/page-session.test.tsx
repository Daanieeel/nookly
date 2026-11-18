import { createPage, createSpace } from "@nookly/shared/data";
import type { PageSession } from "@nookly/shared/sync";
import { act, waitFor } from "expo-router/testing-library";
import { Activity, useState } from "react";
import { Text } from "react-native";
import * as Y from "yjs";
import { PageHostContext } from "../shell/page-host.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { usePageSession } from "./use-page-session.ts";

const seen: string[] = [];

function Probe({ id }: { id: string }) {
  const page = usePageSession(id);
  seen.push(page.state);
  return <Text>{page.state}</Text>;
}

let setVisible: (visible: boolean) => void = () => {};
let setMounted: (mounted: boolean) => void = () => {};

const TAB = { tabId: "t", groupId: "g", path: "/entity/x", active: true, focused: true };

/// A tablet's tab with a page in it, which can be put out of sight or closed.
function Tab({ id }: { id: string }) {
  const [visible, setV] = useState(true);
  const [mounted, setM] = useState(true);
  setVisible = setV;
  setMounted = setM;
  return (
    <PageHostContext.Provider value={TAB}>
      <Activity mode={visible ? "visible" : "hidden"}>
        {mounted ? <Probe id={id} /> : null}
      </Activity>
    </PageHostContext.Provider>
  );
}

/// Sync signed in, with the page's document at hand.
async function signedIn() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  const page = await createPage(data.db, space, "note", "Plans");
  const session: Pick<PageSession, "doc" | "readOnly"> = { doc: new Y.Doc(), readOnly: false };
  const docs = { open: jest.fn(async () => session), release: jest.fn() };
  // SAFETY: a session is only handed on here, and of the documents only `open` and
  // `release` are used.
  data.sync.pages = () => docs as never;
  const { status } = data.sync.store.getState();
  // SAFETY: of the account only that someone is signed in is read.
  const user = { id: "u" } as never;
  data.sync.store.setState({ user, status: { ...status, state: "idle" } });
  seen.length = 0;
  return { data, page, docs };
}

// A live page in a tab put out of sight let go of its document, and opened it again when
// shown: it showed loading and drew its editor anew each time.
describe("a live page in a tablet's tab", () => {
  it("keeps its document while out of sight, and shows it again at once", async () => {
    const { data, page, docs } = await signedIn();
    const screen = await renderScreens({ index: () => <Tab id={page} /> }, data);
    expect(await screen.findByText("live")).toBeTruthy();
    seen.length = 0;
    act(() => setVisible(false));
    act(() => setVisible(true));
    await waitFor(() => expect(screen.getByText("live")).toBeTruthy());
    expect(seen).not.toContain("waiting");
    expect(docs.open).toHaveBeenCalledTimes(1);
    expect(docs.release).not.toHaveBeenCalled();
  });

  it("lets go of it once the tab is closed", async () => {
    jest.useFakeTimers();
    try {
      const { data, page, docs } = await signedIn();
      const screen = await renderScreens({ index: () => <Tab id={page} /> }, data);
      expect(await screen.findByText("live")).toBeTruthy();
      act(() => setMounted(false));
      act(() => jest.advanceTimersByTime(10 * 60_000));
      expect(docs.release).toHaveBeenCalledWith(page);
    } finally {
      jest.useRealTimers();
    }
  });
});
