import { fireEvent, waitFor } from "expo-router/testing-library";
import { isSyncedSetting } from "@nookly/shared/sync";
import { render } from "@testing-library/react-native";
import { phoneSettings } from "../data/settings.ts";
import { VimKeys } from "../editor/VimKeys.tsx";
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
    expect(await screen.findByText("\\pair")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Remove \\pair" }));
    await waitFor(() => expect(screen.queryByText("\\pair")).toBeNull());
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

  it("turns Vim keys on for this phone only, under Editing as on the desktop", async () => {
    phoneSettings.reset("notes.vimMode");
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="editor" /> },
      testData(),
    );
    expect(await screen.findByRole("header", { name: "Editing" })).toBeTruthy();
    await fireEvent(screen.getByLabelText("Vim keys in pages"), "valueChange", true);
    expect(phoneSettings.get("notes.vimMode")).toBe(true);
    expect(isSyncedSetting("notes.vimMode")).toBe(false);
    phoneSettings.reset("notes.vimMode");
  });

  it("lists the desktop's Vim keys for the sheet ? opens", () => {
    const screen = render(<VimKeys />);
    for (const group of ["Modes", "Move", "Edit"]) {
      expect(screen.getByLabelText(group)).toBeTruthy();
    }
    expect(screen.getByText("Delete a word (d with any motion)")).toBeTruthy();
  });
});
