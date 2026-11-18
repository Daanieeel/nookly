import { renderScreens, testData } from "../test/render.tsx";
import { ShortcutsPage } from "./settings/ShortcutsPage.tsx";

describe("Settings, Keyboard Shortcuts", () => {
  it("lists every shortcut by what it does, with its keys", async () => {
    const screen = await renderScreens({ index: () => <ShortcutsPage /> }, testData());
    expect(await screen.findByText("Search")).toBeTruthy();
    expect(screen.getByLabelText("Search, ⌘K")).toBeTruthy();
    expect(screen.getByLabelText("Commands, ⇧⌘P")).toBeTruthy();
    expect(screen.getByLabelText("New Tab, ⌘T")).toBeTruthy();
    expect(screen.getByLabelText("Tabs")).toBeTruthy();
  });
});
