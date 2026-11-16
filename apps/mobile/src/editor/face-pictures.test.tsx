import { addFile, createCard, createDeck, createSpace, listCards } from "@nookly/shared/data";
import { fireEvent } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { CardFaceView, faceRuns } from "./CardFaceView.tsx";

const block = (type: string, content: string) => ({
  type,
  content,
  language: null,
  filename: null,
  attrs: {},
});

async function setup() {
  const data = testData();
  const space = await createSpace(data.db, "Bio", "#22c55e");
  const file = await addFile(data.db, space, "cell.png", "file:///docs/files/aaa-cell.png");
  const deck = await createDeck(data.db, space, "Cells");
  await createCard(
    data.db,
    deck,
    {
      blocks: [block("paragraph", "What is this?"), block("image", `[cell.png](mention:${file})`)],
    },
    { text: "A cell" },
  );
  const [card] = await listCards(data.db, deck);
  return { data, card, file };
}

describe("pictures on a card face", () => {
  it("splits a face into its writing and its pictures", () => {
    const runs = faceRuns([
      block("paragraph", "One"),
      block("paragraph", "Two"),
      block("image", "[cell.png](mention:f1)"),
      block("paragraph", "Three"),
    ]);
    expect(
      runs.map((r) => (r.kind === "picture" ? `picture ${r.fileId} ${r.name}` : r.blocks.length)),
    ).toEqual([2, "picture f1 cell.png", 1]);
  });

  // 10.4: from 6.8, the desktop's `ImageLightbox`: a tapped picture opens large, pinch to zoom.
  it("draws a face's picture on a tablet and opens it large on a tap", async () => {
    const { data, card } = await setup();
    const screen = await renderScreens(
      { index: () => <CardFaceView card={card} side="front" /> },
      data,
      "/",
      { width: 1032 },
    );
    await fireEvent.press(await screen.findByRole("imagebutton", { name: "cell.png" }));
    const box = await screen.findByTestId("image-lightbox");
    expect(box.props.maximumZoomScale).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Close Picture" })).toBeTruthy();
  });

  it("leaves the phone's face as it was", async () => {
    const { data, card } = await setup();
    const screen = await renderScreens(
      { index: () => <CardFaceView card={card} side="front" /> },
      data,
    );
    await screen.findByTestId("card-face-blocks");
    expect(screen.queryByRole("imagebutton", { name: "cell.png" })).toBeNull();
  });
});
