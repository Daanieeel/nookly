import { fetchPageMetadata } from "./bookmark-fetch.ts";

const HEAD = `<head><title>Reading list</title><meta name="description" content="Saved.">
  <link rel="icon" href="/icon.png"></head>`;

afterEach(() => jest.restoreAllMocks());

describe("reading a bookmarked page", () => {
  // Sites behind a bot check answer 403 or 429 with a page that still has the site's icon;
  // the phone gave up on any such answer, where the desktop reads what came back. Its title
  // is the check's own ("Just a moment"), so only the icon and picture are kept.
  it("keeps the site's icon from an error answer, but not the error page's title", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(HEAD, { status: 403 }));
    expect(await fetchPageMetadata("https://example.com/")).toMatchObject({
      title: null,
      description: null,
      faviconUrl: "https://example.com/icon.png",
    });
  });

  it("still fails on an error answer with nothing to read", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchPageMetadata("https://example.com/")).rejects.toThrow(/answered 503/);
  });

  // iOS lets an app fetch secure addresses only; a plain `http` one is asked for over https.
  it("asks for a plain http address over https, which the phone allows", async () => {
    const fake = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(HEAD));
    await fetchPageMetadata("http://example.com/page");
    expect(String(fake.mock.calls[0][0])).toBe("https://example.com/page");
  });
});
