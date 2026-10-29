import { describe, expect, it, vi } from "vitest";
import { makeEntity } from "#/test/fixtures.ts";
import { calledCommands, callsOf, mockCommand, mockCommandWith } from "#/test/tauri.ts";
import {
  createDeepLinkQueue,
  deepLinkFor,
  openDeepLink,
  parseDeepLink,
  startDeepLinks,
} from "./deep-link.ts";
import { useNavStore } from "./store/nav.ts";

const ID = "66fd9c8e-3d3a-403a-b29d-89b2903c3c57";
const BLOCK = "955c5287-1f00-437d-9e6a-7abb422aefdd";

describe("parseDeepLink", () => {
  it("reads a link to an entity", () => {
    expect(parseDeepLink(`nookly://open/${ID}`)).toEqual({ entityId: ID });
  });

  it("reads a link to a block of a page, a page of a file, a row and a column", () => {
    expect(parseDeepLink(`nookly://open/${ID}#${BLOCK}`)).toEqual({ entityId: ID, blockId: BLOCK });
    expect(parseDeepLink(`nookly://open/${ID}#p12`)).toEqual({ entityId: ID, page: 12 });
    expect(parseDeepLink(`nookly://open/${ID}#${BLOCK}_r3`)).toEqual({
      entityId: ID,
      blockId: BLOCK,
      row: 3,
    });
  });

  it("reads a readable key in place of the id, and any case of the scheme", () => {
    expect(parseDeepLink("nookly://open/JOT-12")).toEqual({ entityId: "JOT-12" });
    expect(parseDeepLink(" NOOKLY://OPEN/abc ")).toEqual({ entityId: "abc" });
  });

  it.each([
    "",
    "https://open/abc",
    "nookly:open/abc",
    "nookly://open",
    "nookly://open/",
    "nookly://delete/abc",
    "nookly://open/abc/def",
    "nookly://open/../etc",
    "nookly://open/a b",
    "nookly://open/abc?x=1",
    "nookly://open/abc#",
    "nookly://open/abc#a b",
    "nookly://open/abc#<script>",
    "nookly://user:pw@open/abc",
    "nookly://open:80/abc",
    `nookly://open/${"a".repeat(65)}`,
    "javascript:alert(1)",
  ])("refuses %j", (url) => {
    expect(parseDeepLink(url)).toBeNull();
  });
});

describe("deepLinkFor", () => {
  it("writes the link back, with the block", () => {
    expect(deepLinkFor(ID)).toBe(`nookly://open/${ID}`);
    expect(deepLinkFor(ID, BLOCK)).toBe(`nookly://open/${ID}#${BLOCK}`);
    expect(parseDeepLink(deepLinkFor(ID, BLOCK))).toEqual({ entityId: ID, blockId: BLOCK });
  });
});

describe("the queue of links that arrive before the app has loaded", () => {
  it("holds links until a handler is attached, then hands them over in order", () => {
    const queue = createDeepLinkQueue();
    queue.receive("nookly://open/a");
    queue.receive("nookly://open/b");
    const seen: string[] = [];
    queue.attach((url) => seen.push(url));
    expect(seen).toEqual(["nookly://open/a", "nookly://open/b"]);
  });

  it("hands later links straight over, and drops a handler that was detached", () => {
    const queue = createDeepLinkQueue();
    const seen: string[] = [];
    const detach = queue.attach((url) => seen.push(url));
    queue.receive("nookly://open/c");
    expect(seen).toEqual(["nookly://open/c"]);
    detach();
    queue.receive("nookly://open/d");
    expect(seen).toEqual(["nookly://open/c"]);
    const again: string[] = [];
    queue.attach((url) => again.push(url));
    expect(again).toEqual(["nookly://open/d"]);
  });

  it("does not hand the same link over twice", () => {
    const queue = createDeepLinkQueue();
    queue.receive("nookly://open/e");
    const first = vi.fn();
    queue.attach(first);
    const second = vi.fn();
    queue.attach(second);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

describe("startDeepLinks", () => {
  it("collects the link the app was started with", async () => {
    mockCommand("plugin:deep-link|get_current", ["nookly://open/started"]);
    const seen: string[] = [];
    const queue = createDeepLinkQueue();
    await startDeepLinks(queue);
    queue.attach((url) => seen.push(url));
    expect(seen).toEqual(["nookly://open/started"]);
  });

  it("starts without a link and without the plugin", async () => {
    mockCommand("plugin:deep-link|get_current", null);
    await expect(startDeepLinks(createDeepLinkQueue())).resolves.toBeUndefined();
    mockCommandWith("plugin:deep-link|get_current", () => {
      throw new Error("no plugin");
    });
    await expect(startDeepLinks(createDeepLinkQueue())).resolves.toBeUndefined();
  });
});

describe("openDeepLink", () => {
  function nav() {
    return useNavStore.getState();
  }

  it("opens the entity", async () => {
    mockCommand("get_entity", makeEntity({ id: ID, spaceId: "s9", type: "note" }));
    mockCommand("touch_entity_opened", null);
    expect(await openDeepLink(`nookly://open/${ID}`)).toBe("opened");
    expect(nav().view).toMatchObject({ kind: "entity", entityId: ID, spaceId: "s9" });
  });

  it("opens the block of a page and asks the page to scroll to it", async () => {
    mockCommand("get_entity", makeEntity({ id: ID, spaceId: "s9", type: "note" }));
    mockCommand("touch_entity_opened", null);
    expect(await openDeepLink(`nookly://open/${ID}#${BLOCK}`)).toBe("opened");
    expect(nav().focusBlock).toMatchObject({ entityId: ID, blockId: BLOCK });
  });

  it("opens the entity a readable key names", async () => {
    mockCommand("get_entity", makeEntity({ id: ID, spaceId: "s9", key: "JOT-12", type: "jot" }));
    mockCommand("touch_entity_opened", null);
    expect(await openDeepLink("nookly://open/JOT-12")).toBe("opened");
    expect(callsOf("get_entity")[0]).toMatchObject({ id: "JOT-12" });
    expect(nav().view).toMatchObject({ entityId: ID });
  });

  it("opens an entity in the Trash, which shows faded as everywhere", async () => {
    mockCommand(
      "get_entity",
      makeEntity({ id: ID, spaceId: "s9", deletedAt: "2026-01-01T00:00:00Z" }),
    );
    mockCommand("touch_entity_opened", null);
    expect(await openDeepLink(`nookly://open/${ID}`)).toBe("opened");
    expect(nav().view).toMatchObject({ entityId: ID });
  });

  it("changes nothing and says so when the entity is not on this computer", async () => {
    mockCommandWith("get_entity", () => {
      throw { kind: "NotFound", message: "entity gone" };
    });
    const before = nav().view;
    expect(await openDeepLink("nookly://open/not-here")).toBe("not-found");
    expect(nav().view).toEqual(before);
  });

  it("changes nothing for a link that is not a Nookly link", async () => {
    const before = nav().view;
    expect(await openDeepLink("nookly://delete/abc")).toBe("refused");
    expect(callsOf("get_entity")).toHaveLength(0);
    expect(nav().view).toEqual(before);
  });

  it("only reads: it looks the entity up and opens it, nothing else", async () => {
    mockCommand("get_entity", makeEntity({ id: ID, spaceId: "s9" }));
    mockCommand("touch_entity_opened", null);
    await openDeepLink(`nookly://open/${ID}#${BLOCK}`);
    await openDeepLink("nookly://open/not-a-link/x");
    expect(new Set(calledCommands())).toEqual(new Set(["get_entity", "touch_entity_opened"]));
  });
});
