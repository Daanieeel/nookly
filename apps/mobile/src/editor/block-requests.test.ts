import { createSpace, createTask, listBookmarks, listFiles } from "@nookly/shared/data";
import { testData } from "../test/render.tsx";
import type { BlockRequest } from "./block-bridge.ts";
import { type BlockEnv, answerBlockRequest } from "./block-requests.ts";

type Picked = { name: string; uri: string } | null;

function env(
  data: ReturnType<typeof testData>,
  spaceId: string | null,
  pick: () => Promise<Picked> = async () => null,
): BlockEnv {
  return {
    db: data.db,
    entityId: "none",
    spaceId,
    write: (change) => change(data.db),
    pick,
  };
}
const ask = async (e: BlockEnv, request: BlockRequest) =>
  JSON.parse(await answerBlockRequest(JSON.stringify(request), e));

describe("what the blocks ask of the phone", () => {
  it("finds items by what was typed, and the recent ones when nothing was", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    await createTask(data.db, space, "Write report");
    const found = await ask(env(data, space), { op: "search", query: "report", types: [] });
    expect(found.map((i: { title: string }) => i.title)).toEqual(["Write report"]);
    expect(Object.keys(found[0]).sort()).toEqual(["id", "key", "title"]);
    expect(await ask(env(data, space), { op: "search", query: "report", types: ["file"] })).toEqual(
      [],
    );
  });

  it("keeps a picked file in the page's Space and answers with a mention of it", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const pick = async () => ({ name: "lecture.pdf", uri: "file:///files/abc-lecture.pdf" });
    const answer = await ask(env(data, space, pick), { op: "upload" });
    const [file] = await listFiles(data.db, space);
    expect(answer.rows).toBe(`[lecture.pdf](mention:${file.entity.id})`);
    expect(await ask(env(data, space), { op: "upload" })).toEqual({ canceled: true });
  });

  it("saves a link as a Bookmark and answers with a mention of it", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const answer = await ask(env(data, space), { op: "bookmark", url: "https://example.com/a" });
    const [bookmark] = await listBookmarks(data.db, space);
    expect(bookmark.url).toBe("https://example.com/a");
    expect(answer.rows).toBe(`[example.com/a](mention:${bookmark.entity.id})`);
  });

  it("says so when the page is in no Space", async () => {
    const data = testData();
    const answer = await ask(env(data, null), { op: "bookmark", url: "https://example.com" });
    expect(answer.error).toMatch(/Space/);
  });
});
