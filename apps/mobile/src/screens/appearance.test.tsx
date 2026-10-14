import { fireEvent, waitFor } from "expo-router/testing-library";
import { Appearance } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { restoreTheme } from "../data/appearance.ts";
import { SettingsCategoryScreen } from "./SettingsScreen.tsx";

describe("the theme in Settings", () => {
  it("follows the system until Light or Dark is picked, and remembers the pick", async () => {
    const setColorScheme = jest.spyOn(Appearance, "setColorScheme");
    const data = testData();
    restoreTheme(data.theme);
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="appearance" /> },
      data,
    );
    const system = (await screen.findAllByRole("radio", { name: "System" }))[0];
    expect(system.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getAllByRole("radio", { name: "Dark" })[0]);
    await waitFor(() => expect(setColorScheme).toHaveBeenLastCalledWith("dark"));
    expect(data.theme.get()).toBe("dark");
    expect(screen.getAllByRole("radio", { name: "Dark" })[0].props.accessibilityState.checked).toBe(
      true,
    );
    await fireEvent.press(screen.getAllByRole("radio", { name: "System" })[0]);
    await waitFor(() => expect(setColorScheme).toHaveBeenLastCalledWith("unspecified"));
  });
});
