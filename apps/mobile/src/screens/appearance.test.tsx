import { fireEvent, waitFor } from "expo-router/testing-library";
import { Appearance } from "react-native";
import { renderScreens, testData } from "../test/render.tsx";
import { SettingsScreen } from "./SettingsScreen.tsx";

describe("the theme in Settings", () => {
  it("follows the system until Light or Dark is picked, and remembers the pick", async () => {
    const setColorScheme = jest.spyOn(Appearance, "setColorScheme");
    const data = testData();
    const screen = await renderScreens({ index: () => <SettingsScreen /> }, data);
    const system = await screen.findByRole("radio", { name: "System" });
    expect(system.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => expect(setColorScheme).toHaveBeenLastCalledWith("dark"));
    expect(data.theme.get()).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole("radio", { name: "System" }));
    await waitFor(() => expect(setColorScheme).toHaveBeenLastCalledWith("unspecified"));
  });
});
