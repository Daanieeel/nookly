import { createCard, createDeck, createSpace, listCards, reviewCard } from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { EntityScreen } from "./EntityScreen.tsx";

async function open() {
  const data = testData();
  const space = await createSpace(data.db, "Uni", "#3b82f6");
  const deck = await createDeck(data.db, space, "Sorting");
  await createCard(data.db, deck, "Quicksort average?", "n log n");
  const screen = await renderScreens(
    { "entity/[id]": () => <EntityScreen id={deck} /> },
    data,
    `/entity/${deck}`,
  );
  return { data, deck, screen };
}

describe("a deck's page", () => {
  it("shows the figures, a button to study, and its cards as small index cards", async () => {
    const { screen } = await open();
    expect((await screen.findAllByText("New")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Study 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quicksort average?, n log n" })).toBeTruthy();
    expect(screen.getByText("1 card waiting")).toBeTruthy();
    // At a glance a count says what it counts, not a bare number.
    expect(screen.getByText("1 card")).toBeTruthy();
    expect(screen.getByText("0 rated today")).toBeTruthy();
  });

  it("says how many cards were rated today, as the desktop's deck does", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const deck = await createDeck(data.db, space, "Sorting");
    await reviewCard(
      data.db,
      await createCard(data.db, deck, "Quicksort average?", "n log n"),
      "good",
    );
    const screen = await renderScreens(
      { "entity/[id]": () => <EntityScreen id={deck} /> },
      data,
      `/entity/${deck}`,
    );
    expect(
      (await screen.findAllByLabelText("Rated today, 1", { includeHiddenElements: true })).length,
    ).toBeGreaterThan(0);
  });

  it("writes a card on the large card: the front, flipped, then the back", async () => {
    const { data, deck, screen } = await open();
    await fireEvent.press(await screen.findByRole("button", { name: "Write cards 1" }));
    await fireEvent.changeText(
      await screen.findByLabelText("The question"),
      "Mergesort worst case?",
    );
    expect(screen.getByRole("button", { name: "Add Card" }).props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Flip to Back" }));
    await fireEvent.changeText(await screen.findByLabelText("The answer"), "n log n");
    await fireEvent.press(screen.getByRole("button", { name: "Add Card" }));
    await waitFor(async () => expect(await listCards(data.db, deck)).toHaveLength(2));
    // Written with the page editor, as the desktop writes cards: as blocks.
    expect((await listCards(data.db, deck))[1].frontBlocks).toEqual([
      {
        type: "paragraph",
        content: "Mergesort worst case?",
        language: null,
        filename: null,
        attrs: {},
      },
    ]);
    expect(await screen.findByText("1 card added")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(
      await screen.findByRole("button", { name: "Mergesort worst case?, n log n" }),
    ).toBeTruthy();
  });

  it("edits a card from its small card", async () => {
    const { data, deck, screen } = await open();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Quicksort average?, n log n" }),
    );
    await fireEvent.changeText(
      await screen.findByLabelText("The question"),
      "Quicksort worst case?",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Save Card" }));
    await waitFor(async () =>
      expect((await listCards(data.db, deck))[0].front).toBe("Quicksort worst case?"),
    );
  });

  it("keeps what the desktop wrote on a face that was not edited (a picture, a formula)", async () => {
    const { data, deck, screen } = await open();
    const [card] = await listCards(data.db, deck);
    data.driver.exec(
      "UPDATE index_cards SET front_blocks = ? WHERE id = ?",
      JSON.stringify([
        { type: "paragraph", content: "Quicksort average?", attrs: {} },
        { type: "image", content: "", attrs: { file: "f1" } },
      ]),
      card.id,
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "Quicksort average?, n log n" }),
    );
    await fireEvent.changeText(await screen.findByLabelText("The answer"), "O(n log n)");
    await fireEvent.press(screen.getByRole("button", { name: "Save Card" }));
    await waitFor(async () => expect((await listCards(data.db, deck))[0].back).toBe("O(n log n)"));
    expect((await listCards(data.db, deck))[0].frontBlocks?.[1]).toMatchObject({
      type: "image",
      attrs: { file: "f1" },
    });
  });
});
