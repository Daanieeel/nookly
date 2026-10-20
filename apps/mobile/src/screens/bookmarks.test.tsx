import { createBookmark, createSpace, getBookmarkDetails, getEntity } from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { BookmarkList } from "./BookmarkList.tsx";
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
    const screen = await renderScreens({ index: () => <BookmarkList spaceId={space} /> }, data);
    expect(await screen.findByRole("link", { name: "Example A" })).toBeTruthy();
    expect(screen.getByText(/^example\.com · /)).toBeTruthy();
    const field = screen.getByLabelText("Paste a URL to save it");
    await fireEvent.changeText(field, "kubernetes.io/docs/");
    await fireEvent(field, "submitEditing");
    await waitFor(() => expect(fake).toHaveBeenCalled());
    expect(await screen.findByRole("link", { name: "Kubernetes Deployments" })).toBeTruthy();
    fake.mockRestore();
  });
});
