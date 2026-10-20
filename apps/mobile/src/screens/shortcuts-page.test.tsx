import { renderScreens, testData } from "../test/render.tsx";
import { ShortcutsPage } from "./settings/ShortcutsPage.tsx";

describe("Settings, Keyboard Shortcuts", () => {
  it("lists every shortcut by what it does, with its keys", async () => {
    const screen = await renderScreens({ index: () => <ShortcutsPage /> }, testData());
    expect(await screen.findByText("Search")).toBeTruthy();
    expect(screen.getByLabelText("Search shortcut").props.children).toBe("⌘K");
    expect(screen.getByLabelText("Commands shortcut").props.children).toBe("⇧⌘P");
    expect(screen.getByLabelText("New Tab shortcut").props.children).toBe("⌘T");
    expect(screen.getByText("Tabs")).toBeTruthy();
  });
});
