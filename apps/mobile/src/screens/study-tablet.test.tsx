import { createCard, createDeck, createSpace, listCards } from "@nookly/shared/data";
import { act } from "expo-router/testing-library";
import { StyleSheet } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { usePageKeys } from "../shell/page-keys.ts";
import { StudyScreen } from "./StudyScreen.tsx";

const key = (id: string) => act(() => usePageKeys.getState().run(id));

// A tablet's study session (9.3): the card centred at most 720 wide, and the desktop's keys:
// Space shows the answer, 1 to 4 rate it, Command Z takes the last rating back.
describe("studying on a tablet", () => {
  it("studies with the desktop's keys, the card at most 720 wide", async () => {
    const data = testData();
    const space = await createSpace(data.db, "Uni", "#3b82f6");
    const deck = await createDeck(data.db, space, "Sorting");
    await createCard(data.db, deck, "Quicksort average?", "n log n");
    const screen = await renderScreens({ index: () => <StudyScreen deckId={deck} /> }, data, "/", {
      width: 1376,
      height: 1032,
    });
    expect(await screen.findByText("Quicksort average?")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId("study-column").props.style).maxWidth).toBe(720);
    expect(usePageKeys.getState().keys.map((k) => k.key)).toEqual(
      expect.arrayContaining([" ", "1", "2", "3", "4", "z"]),
    );
    key("showAnswer");
    expect(await screen.findByText("n log n")).toBeTruthy();
    key("rate4");
    expect(await screen.findByText("All caught up")).toBeTruthy();
    key("undoRating");
    expect(await screen.findByText("Quicksort average?")).toBeTruthy();
    const [card] = await listCards(data.db, deck);
    expect(card.reps).toBe(0);
  });
});
