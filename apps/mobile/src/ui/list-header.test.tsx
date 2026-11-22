import { fireEvent, within } from "expo-router/testing-library";
import { useState } from "react";
import { StyleSheet } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { ListHeader, type ListPanel } from "./ListBar.tsx";
import { ListControls } from "./ListControls.tsx";

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

  // With a long title, Display wrapped onto a line of its own below Filter. The two buttons
  // are one group, so when they do not fit beside the title they wrap together.
  it("keeps Filter and Display together in one group", async () => {
    const screen = await renderScreens({ index: () => <Header /> }, testData());
    const group = await screen.findByTestId("list-header-buttons");
    expect(within(group).getByRole("button", { name: "Filter" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Display" })).toBeTruthy();
  });

  // A tablet's Filter and Display are the desktop's popovers, under their buttons (3.2).
  it("opens Filter and Display as popovers on a tablet and as sheets on a phone", async () => {
    const controls = () => <ListControls title="Tasks" count={3} filters={[]} display={null} />;
    const tablet = await renderScreens({ index: controls }, testData(), "/", { width: 1032 });
    await fireEvent.press(await tablet.findByRole("button", { name: "Filter" }));
    expect(await tablet.findByTestId("sheet-popover")).toBeTruthy();
    tablet.unmount();
    const phone = await renderScreens({ index: controls }, testData());
    await fireEvent.press(await phone.findByRole("button", { name: "Display" }));
    expect(phone.queryByTestId("sheet-popover")).toBeNull();
  });
});
