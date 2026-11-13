import { fireEvent } from "expo-router/testing-library";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { ListHeader, type ListPanel } from "./ListBar.tsx";

function Header() {
  const [panel, setPanel] = useState<ListPanel>(null);
  return <ListHeader title="Tasks" count={3} panel={panel} onPanel={setPanel} />;
}

describe("a list's header", () => {
  // The desktop's Filter and Display are secondary buttons, with their background, whether
  // their popover is open or not. They had turned into ghost buttons on the phone.
  it("shows Filter and Display as secondary buttons, open or closed", async () => {
    const screen = await renderScreens({ index: () => <Header /> }, testData());
    const filled = (name: string) =>
      Boolean(StyleSheet.flatten(screen.getByRole("button", { name }).props.style).backgroundColor);
    expect(await screen.findByRole("button", { name: "Filter" })).toBeTruthy();
    expect([filled("Filter"), filled("Display")]).toEqual([true, true]);
    await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
    expect([filled("Filter"), filled("Display")]).toEqual([true, true]);
  });
});
