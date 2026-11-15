import {
  attachLabel,
  createBookmark,
  createLabel,
  createSpace,
  getBookmarkDetails,
  getEntity,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import Storage from "../test/kv-store.ts";
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
    await fireEvent.press(screen.getByRole("button", { name: "Remove Labels Filter" }));
    await fireEvent.press(screen.getByRole("button", { name: "Display" }));
    await fireEvent.press(await screen.findByRole("radio", { name: "List" }));
    await choose(screen, "Grouping", "Site");
    expect(await screen.findByRole("header", { name: "other.org" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "example.com" })).toBeTruthy();
  });

  // Cards showed a bare bookmark icon for every page without its own picture, though the
  // desktop had captured it. As there: the capture first (unless the site's picture was
  // picked), then the site's picture, then its icon large.
  it("pictures each card as the desktop does", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    const shot = await createBookmark(data.db, space, "https://a.org", "Shot");
    const picked = await createBookmark(data.db, space, "https://b.org", "Picked");
    const og = await createBookmark(data.db, space, "https://c.org", "Og");
    const icon = await createBookmark(data.db, space, "https://d.org", "Icon");
    const set = (sql: string, ...params: string[]) => data.driver.exec(sql, ...params);
    const read = "metadata_fetched_at = '2026-01-01T00:00:00.000Z'";
    set(`UPDATE bookmarks SET ${read}, screenshot_path = ?, preview_image_url = ? WHERE entity_id = ?`, "file:///docs/shots/a.png", "https://a.org/og.png", shot);
    set(`UPDATE bookmarks SET ${read}, screenshot_path = ?, preview_image_url = ?, preferred_image = 'preview' WHERE entity_id = ?`, "file:///docs/shots/b.png", "https://b.org/og.png", picked);
    set(`UPDATE bookmarks SET ${read}, preview_image_url = ? WHERE entity_id = ?`, "https://c.org/og.png", og);
    set(`UPDATE bookmarks SET ${read}, favicon_url = ? WHERE entity_id = ?`, "https://d.org/f.png", icon);
    const screen = await renderScreens({ index: () => <Bookmarks space={space} /> }, data);
    const picture = async (title: string) =>
      (await screen.findByTestId(`picture-${title}`)).props.source?.uri;
    expect(await picture("Shot")).toMatch(/shots\/a\.png$/);
    expect(await picture("Picked")).toBe("https://b.org/og.png");
    expect(await picture("Og")).toBe("https://c.org/og.png");
    expect(await picture("Icon")).toBe("https://d.org/f.png");
  });

  // A bookmark saved elsewhere, or while offline, was only read when opened, so the list kept
  // showing it bare. The list reads each unread page once.
  it("reads the pages of bookmarks never read", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    const id = await createBookmark(data.db, space, "https://kubernetes.io/docs/");
    const fake = serve(PAGE);
    const screen = await renderScreens({ index: () => <Bookmarks space={space} /> }, data);
    await waitFor(async () =>
      expect((await getBookmarkDetails(data.db, id))?.previewImageUrl).toBe(
        "https://kubernetes.io/card.png",
      ),
    );
    expect(await screen.findByRole("link", { name: "Kubernetes Deployments" })).toBeTruthy();
    expect(fake).toHaveBeenCalledTimes(1);
  });

  // The Site filter was a bare list of addresses: it searches, shows each site's icon and
  // mutes the part of the address everyone has ("https://www.").
  it("finds a site by search, with its icon and its address's important part", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    const g = await createBookmark(data.db, space, "https://www.google.com/a", "Google");
    await createBookmark(data.db, space, "https://other.org/b", "Other B");
    data.driver.exec("UPDATE bookmarks SET favicon_url = ? WHERE entity_id = ?",
      "https://www.google.com/f.png",
      g,
    );
    const screen = await renderScreens({ index: () => <Bookmarks space={space} /> }, data);
    expect(await screen.findByRole("link", { name: "Other B" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Site");
    expect(await screen.findByLabelText("Search Site")).toBeTruthy();
    expect(screen.getByText("https://www.")).toBeTruthy();
    expect(screen.getByTestId("site-icon-www.google.com").props.source).toEqual({
      uri: "https://www.google.com/f.png",
    });
    await fireEvent.changeText(screen.getByLabelText("Search Site"), "goo");
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "other.org" })).toBeNull());
    await fireEvent.press(screen.getByRole("checkbox", { name: "google.com" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Other B" })).toBeNull());
  });

  // The Filter sheet came up empty while no bookmark had a label or a site to offer.
  it("lists every filter even with nothing to pick yet, and narrows to when they were created", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    const empty = await renderScreens({ index: () => <Bookmarks space={space} /> }, data);
    await fireEvent.press(await empty.findByRole("button", { name: "Filter" }));
    for (const name of ["Labels", "Site", "Pinned", "Created", "Updated"]) {
      expect(await empty.findByRole("button", { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    empty.unmount();
    const old = await createBookmark(data.db, space, "https://old.org/a", "Old one");
    await createBookmark(data.db, space, "https://new.org/b", "New one");
    data.driver.exec(
      "UPDATE entities SET created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?",
      old,
    );
    const screen = await renderScreens({ index: () => <Bookmarks space={space} /> }, data);
    expect(await screen.findByRole("link", { name: "Old one" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    await openRow(screen, "Created");
    await fireEvent.press(await screen.findByRole("checkbox", { name: "Today" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Old one" })).toBeNull());
    expect(screen.getByRole("link", { name: "New one" })).toBeTruthy();
  });

  // A new filter must not lose the display someone already picked on this phone.
  it("keeps a display saved before Pinned, Created and Updated existed", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Web", "#3b82f6");
    await createBookmark(data.db, space, "https://example.com/a", "Example A");
    Storage.setItemSync(
      `nookly.preference.bookmarks.display.${space}`,
      JSON.stringify({
        layout: "list",
        grouping: "site",
        ordering: "newest",
        showPreviews: true,
        showDescriptions: true,
        labels: [],
        sites: [],
      }),
    );
    const screen = await renderScreens({ index: () => <Bookmarks space={space} /> }, data);
    expect(await screen.findByRole("header", { name: "example.com" })).toBeTruthy();
  });
});
