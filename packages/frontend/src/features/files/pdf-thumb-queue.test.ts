import { beforeEach, describe, expect, it } from "vitest";
import { createThumbnails } from "./pdf-thumb-queue.ts";

const AT_ONCE = 2;

/// A renderer that draws nothing until the test says which thumbnail is done.
function setup(keep = 100) {
  const started: string[] = [];
  const finish = new Map<string, () => void>();
  const released: string[] = [];
  const thumbnails = createThumbnails({
    draw: (src) => {
      started.push(src);
      return new Promise<string>((resolve) => finish.set(src, () => resolve(`img:${src}`)));
    },
    atOnce: AT_ONCE,
    keep,
    release: (url) => released.push(url),
  });
  const settle = async (src: string) => {
    finish.get(src)?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { thumbnails, started, settle, released };
}

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

const ignore = () => {};

describe("createThumbnails", () => {
  it("draws only a few at once, so a screen full of PDFs does not stall", () => {
    for (let i = 0; i < 6; i++) t.thumbnails.request(`${i}.pdf`, ignore, ignore);
    expect(t.started).toEqual(["0.pdf", "1.pdf"]);
  });

  it("starts the next one as soon as one is drawn", async () => {
    for (let i = 0; i < 4; i++) t.thumbnails.request(`${i}.pdf`, ignore, ignore);
    await t.settle("0.pdf");
    expect(t.started).toEqual(["0.pdf", "1.pdf", "2.pdf"]);
  });

  it("never draws one whose tile left before its turn came", async () => {
    for (let i = 0; i < 2; i++) t.thumbnails.request(`${i}.pdf`, ignore, ignore);
    const cancel = t.thumbnails.request("2.pdf", ignore, ignore);
    cancel();
    await t.settle("0.pdf");
    expect(t.started).toEqual(["0.pdf", "1.pdf"]);
  });

  it("hands over the image, and shows it again later without drawing it", async () => {
    const shown: string[] = [];
    t.thumbnails.request("a.pdf", (url) => shown.push(url), ignore);
    await t.settle("a.pdf");
    expect(shown).toEqual(["img:a.pdf"]);
    expect(t.thumbnails.cached("a.pdf")).toBe("img:a.pdf");
    expect(t.started).toEqual(["a.pdf"]);
  });

  it("keeps a drawn image even when its tile left while it was drawn", async () => {
    const cancel = t.thumbnails.request("a.pdf", ignore, ignore);
    cancel();
    await t.settle("a.pdf");
    expect(t.thumbnails.cached("a.pdf")).toBe("img:a.pdf");
  });

  it("reports a PDF that could not be drawn, and goes on", async () => {
    let failed = false;
    const broken = createThumbnails({
      draw: (src) => (src === "bad.pdf" ? Promise.reject(new Error("bad")) : Promise.resolve(src)),
      atOnce: 1,
      keep: 10,
      release: ignore,
    });
    const shown: string[] = [];
    broken.request("bad.pdf", ignore, () => (failed = true));
    broken.request("good.pdf", (url) => shown.push(url), ignore);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failed).toBe(true);
    expect(shown).toEqual(["good.pdf"]);
  });

  it("lets go of the oldest images past the limit", async () => {
    const small = setup(2);
    for (const src of ["a", "b", "c"]) {
      small.thumbnails.request(src, ignore, ignore);
      await small.settle(src);
    }
    expect(small.thumbnails.cached("a")).toBeNull();
    expect(small.thumbnails.cached("c")).toBe("img:c");
    expect(small.released).toEqual(["img:a"]);
  });
});
