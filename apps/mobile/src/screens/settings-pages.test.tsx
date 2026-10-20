import { fireEvent, waitFor } from "expo-router/testing-library";
import { phoneSettings } from "../data/settings.ts";
import { renderScreens, testData } from "../test/render.tsx";
import { SettingsCategoryScreen, SettingsScreen } from "./SettingsScreen.tsx";

describe("Settings", () => {
  it("searches across every category by title and by the words people look for", async () => {
    const screen = await renderScreens({ index: () => <SettingsScreen /> }, testData());
    await fireEvent.changeText(await screen.findByLabelText("Search settings"), "katex");
    expect(await screen.findByText("LaTeX macros")).toBeTruthy();
    expect(screen.queryByText("Sign in to sync")).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Search settings"), "zzzz nothing");
    expect(await screen.findByText("No setting matches.")).toBeTruthy();
  });

  it("lists the pages the desktop has, with LaTeX and Backup", async () => {
    const screen = await renderScreens({ index: () => <SettingsScreen /> }, testData());
    for (const title of ["General", "Appearance", "Calendar", "Editor", "LaTeX", "Backup"]) {
      expect(await screen.findByText(title)).toBeTruthy();
    }
  });

  it("groups a category's settings under the desktop's headings", async () => {
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="general" /> },
      testData(),
    );
    for (const heading of ["Profile", "Date and time", "Tasks"]) {
      expect(await screen.findByRole("header", { name: heading })).toBeTruthy();
    }
  });

  it("adds a LaTeX macro to the list, and takes it off again", async () => {
    phoneSettings.reset("notes.latexMacros");
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="latex" /> },
      testData(),
    );
    await fireEvent.changeText(await screen.findByLabelText("Command"), "\\pair");
    await fireEvent.changeText(screen.getByLabelText("Definition"), "(#1, #2)");
    await fireEvent.press(screen.getByRole("button", { name: "Add Macro" }));
    expect(await screen.findByText("2 arguments")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove \\pair" }));
    await waitFor(() => expect(screen.queryByText("2 arguments")).toBeNull());
    phoneSettings.reset("notes.latexMacros");
  });

  it("says what a LaTeX macro is not valid", async () => {
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="latex" /> },
      testData(),
    );
    await fireEvent.changeText(await screen.findByLabelText("Command"), "123");
    await fireEvent.changeText(screen.getByLabelText("Definition"), "x");
    await fireEvent.press(screen.getByRole("button", { name: "Add Macro" }));
    expect(await screen.findByText(/backslash and letters/)).toBeTruthy();
  });
});
