import {
  attachLabel,
  createBookmark,
  createLabel,
  createSpace,
  getBookmarkDetails,
  getEntity,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { choose, openRow } from "../test/sheet.ts";
import { BookmarkList, BookmarkPasteBar } from "./BookmarkList.tsx";

/// The page as the module shows it: the list, and the paste bar floating under it.
function Bookmarks({ space }: { space: string }) {
  return (
    <>
      <BookmarkList spaceId={space} />
      <BookmarkPasteBar spaceId={space} />
    </>
  );
}
import { EntityScreen } from "./EntityScreen.tsx";

const PAGE = `<head><title>Kubernetes Deployments</title>
  <meta name="description" content="A Deployment manages Pods.">
  <meta property="og:image" content="/card.png">
  <link rel="icon" href="/f.png"></head>`;

function serve(html: string, status = 200) {
  return jest
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => new Response(html, { status }));
}

describe("a bookmark", () => {
  it("reads its page once when first opened, titling it and showing its details", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    const id = await createBookmark(data.db, space, "https://kubernetes.io/docs/");
    const fake = serve(PAGE);
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={id} /> },
      data,
      `/entity/${id}`,
    );
    await waitFor(async () =>
      expect((await getEntity(data.db, id))?.title).toBe("Kubernetes Deployments"),
    );
    expect(await getBookmarkDetails(data.db, id)).toMatchObject({
      description: "A Deployment manages Pods.",
      faviconUrl: "https://kubernetes.io/f.png",
      previewImageUrl: "https://kubernetes.io/card.png",
    });
    expect(await screen.findByLabelText("Preview")).toBeTruthy();
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("says so when the page can't be reached, and keeps what it has", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    const id = await createBookmark(data.db, space, "https://example.com/", "Mine");
    serve("", 503);
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={id} /> },
      data,
      `/entity/${id}`,
    );
    expect(await screen.findByText(/The page answered 503/)).toBeTruthy();
    expect((await getEntity(data.db, id))?.title).toBe("Mine");
    serve(PAGE);
    await fireEvent.press(await screen.findByRole("button", { name: "Couldn't reach it" }));
    await waitFor(async () =>
      expect((await getBookmarkDetails(data.db, id))?.fetchedAt).not.toBeNull(),
    );
    expect((await getEntity(data.db, id))?.title).toBe("Mine");
  });
});

describe("a Space's bookmarks", () => {
  it("shows them as cards and saves a pasted URL, reading its page afterwards", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    await createBookmark(data.db, space, "https://example.com/a", "Example A");
    const fake = serve(PAGE);
    const screen = await renderScreens({ index: () => <Bookmarks space={space} /> }, data);
    expect(await screen.findByRole("link", { name: "Example A" })).toBeTruthy();
    expect(screen.getByText(/^example\.com · /)).toBeTruthy();
    const field = screen.getByLabelText("Paste a URL to save it");
    await fireEvent.changeText(field, "kubernetes.io/docs/");
    await fireEvent(field, "submitEditing");
    await waitFor(() => expect(fake).toHaveBeenCalled());
    expect(await screen.findByRole("link", { name: "Kubernetes Deployments" })).toBeTruthy();
    fake.mockRestore();
  });

  // The desktop's Filter and Display, in Linear's sheets (D65).
  it("narrows to a label, and shows as a list grouped by site", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    const a = await createBookmark(data.db, space, "https://example.com/a", "Example A");
    await createBookmark(data.db, space, "https://other.org/b", "Other B");
    const later = await createLabel(data.db, space, "Later");
    await attachLabel(data.db, a, later);
    const screen = await renderScreens({ index: () => <Bookmarks space={space} /> }, data);
    expect(await screen.findByRole("link", { name: "Other B" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Labels");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Other B" })).toBeNull());
    expect(screen.getByRole("link", { name: "Example A" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("checkbox", { name: "Later ×" }));
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "List" }));
    await choose(screen, "Grouping", "Site");
    expect(await screen.findByRole("header", { name: "other.org" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "example.com" })).toBeTruthy();
  });
});
