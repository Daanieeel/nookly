import { beforeEach, describe, expect, it } from "vitest";
import { createBookmark, getBookmarkDetails, setBookmarkMetadata } from "./bookmarks.ts";
import { htmlUnescape, pageMetadata, pageText } from "./bookmark-metadata.ts";
import type { LocalDb } from "./db.ts";
import { createSpace, getEntity } from "./entities.ts";
import { testDb } from "./test-db.ts";

describe("reading a page", () => {
  it("reads minified, unquoted markup, and picks the icon nearest 32 px", () => {
    const html = `<head><title>Deployments | Kubernetes</title>
      <meta property=og:image content=/images/kubernetes-open-graph.png>
      <meta name="description" content="A Deployment manages Pods, one that doesn't keep state.">
      <link rel="shortcut icon" type=image/png href=/images/kubernetes.png>
      <link rel=icon type=image/png sizes=64x64 href=/icons/favicon-64.png>
      <link rel=icon type=image/png sizes=32x32 href=/icons/favicon-32.png>
      <link rel=apple-touch-icon-180x180 href=/icons/apple-180.png></head>`;
    const meta = pageMetadata(html, "https://kubernetes.io/docs/deployment/");
    expect(meta).toEqual({
      title: "Deployments | Kubernetes",
      description: "A Deployment manages Pods, one that doesn't keep state.",
      previewImageUrl: "https://kubernetes.io/images/kubernetes-open-graph.png",
      faviconUrl: "https://kubernetes.io/icons/favicon-32.png",
    });
  });

  it("reads content before property, decodes entities, and guesses /favicon.ico", () => {
    const html = `<meta content='It&#8217;s &amp; more' property="og:description">
      <meta content="https://cdn.x.dev/card.png" property="og:image">`;
    expect(pageMetadata(html, "https://x.dev/")).toEqual({
      title: null,
      description: "It’s & more",
      previewImageUrl: "https://cdn.x.dev/card.png",
      faviconUrl: "https://x.dev/favicon.ico",
    });
  });

  it("uses GitHub's own preview for a repository, and the page title without an og title", () => {
    const meta = pageMetadata("<title> Repo page </title>", "https://github.com/owner/repo/issues");
    expect(meta.previewImageUrl).toBe("https://opengraph.githubassets.com/1/owner/repo");
    expect(meta.title).toBe("Repo page");
  });

  it("decodes named and numeric entities and leaves unknown ones", () => {
    expect(htmlUnescape("a &amp; b &lt;c&gt; &#x41;&#66; &nosuch; &mdash;")).toBe(
      "a & b <c> AB &nosuch; —",
    );
  });

  it("makes plain text without scripts and styles", () => {
    const html = `<html><head><style>body { color: red; }</style>
      <script>console.log("hidden");</script></head>
      <body><h1>Rust  ownership</h1><p>Borrowing   rules matter.</p></body></html>`;
    expect(pageText(html)).toBe("Rust ownership Borrowing rules matter.");
  });
});

describe("putting it on a bookmark", () => {
  let db: LocalDb;
  beforeEach(() => {
    db = testDb();
  });

  it("titles one nobody titled, and fills an empty note but never overwrites writing", async () => {
    const space = await createSpace(db, "S", "#000000");
    const untitled = await createBookmark(db, space, "https://example.com/page");
    const written = await createBookmark(db, space, "https://example.org/", "My own name");
    await db.driver.batch([
      {
        sql: "UPDATE bookmarks SET description = 'my note' WHERE entity_id = ?",
        params: [written],
      },
    ]);
    const meta = {
      title: "Example page",
      description: "From the page",
      faviconUrl: "https://example.com/f.ico",
      previewImageUrl: null,
    };
    await setBookmarkMetadata(db, untitled, meta);
    await setBookmarkMetadata(db, written, meta);
    expect((await getEntity(db, untitled))?.title).toBe("Example page");
    expect(await getBookmarkDetails(db, untitled)).toMatchObject({
      description: "From the page",
      faviconUrl: "https://example.com/f.ico",
    });
    expect((await getEntity(db, written))?.title).toBe("My own name");
    expect((await getBookmarkDetails(db, written))?.description).toBe("my note");
    expect((await getBookmarkDetails(db, written))?.fetchedAt).not.toBeNull();
  });
});
