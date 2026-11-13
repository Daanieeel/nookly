import { fireEvent, waitFor } from "expo-router/testing-library";
import { isSyncedSetting } from "@nookly/shared/sync";
import { render } from "@testing-library/react-native";
import { readPreference, writePreference } from "../data/preferences.ts";
import { phoneSettings } from "../data/settings.ts";
import { HAPTICS_PREFERENCE, hapticsPreference } from "../ui/haptics.ts";
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
    expect(
      await screen.findByRole("summary", { name: "No Results. No setting matches." }),
    ).toBeTruthy();
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

  it("adds a LaTeX macro in a sheet, with a live preview, as on the desktop", async () => {
    phoneSettings.reset("notes.latexMacros");
    phoneSettings.setJson("notes.latexMacros", "");
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="latex" /> },
      testData(),
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Add Macro" }));
    await fireEvent.changeText(await screen.findByLabelText("Command name"), "\\pair");
    await fireEvent.changeText(screen.getByLabelText("Definition"), "(#1, #2)");
    expect(await screen.findByText("2 arguments")).toBeTruthy();
    // The command used on sample arguments, drawn as it will be in a formula.
    expect(screen.getAllByLabelText("\\pair{x}{y}").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: "Save Macro" }));
    await waitFor(() =>
      expect(String(phoneSettings.get("notes.latexMacros"))).toBe(
        "\\newcommand{\\pair}[2]{(#1, #2)}",
      ),
    );
    expect(await screen.findByRole("button", { name: "Edit \\pair" })).toBeTruthy();
    phoneSettings.reset("notes.latexMacros");
  });

  it("says what is wrong with a macro and keeps it from being saved", async () => {
    phoneSettings.setJson("notes.latexMacros", "\\newcommand{\\N}{\\mathbb{N}}");
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="latex" /> },
      testData(),
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Add Macro" }));
    await fireEvent.changeText(await screen.findByLabelText("Command name"), "N2");
    expect(await screen.findByText("A command name is letters only, like N or abs.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Command name"), "N");
    expect(await screen.findByText("\\N is already defined.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Macro" })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Command name"), "R");
    await fireEvent.changeText(screen.getByLabelText("Definition"), "\\notacommand");
    expect(await screen.findByText(/^Invalid LaTeX/)).toBeTruthy();
    phoneSettings.reset("notes.latexMacros");
  });

  it("fills the form from a pasted newcommand", async () => {
    phoneSettings.setJson("notes.latexMacros", "");
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="latex" /> },
      testData(),
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Add Macro" }));
    await fireEvent.changeText(
      await screen.findByLabelText("Command name"),
      "\\newcommand{\\abs}[1]{\\left|#1\\right|}",
    );
    expect(screen.getByLabelText("Command name").props.value).toBe("abs");
    expect(screen.getByLabelText("Definition").props.value).toBe("\\left|#1\\right|");
    phoneSettings.reset("notes.latexMacros");
  });

  it("edits a macro and deletes it after asking", async () => {
    phoneSettings.setJson("notes.latexMacros", "\\newcommand{\\N}{\\mathbb{N}}");
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="latex" /> },
      testData(),
    );
    // Each macro shows what it draws.
    expect(await screen.findByLabelText("\\N")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Edit \\N" }));
    await fireEvent.changeText(await screen.findByLabelText("Definition"), "\\mathbb{Z}");
    await fireEvent.press(screen.getByRole("button", { name: "Save Macro" }));
    await waitFor(() =>
      expect(String(phoneSettings.get("notes.latexMacros"))).toBe("\\newcommand{\\N}{\\mathbb{Z}}"),
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Delete \\N" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(String(phoneSettings.get("notes.latexMacros"))).toBe(""));
    phoneSettings.reset("notes.latexMacros");
  });

  it("keeps a macro list with lines it can't read for the raw view", async () => {
    phoneSettings.setJson("notes.latexMacros", "\\newcommand{\\N}{\\mathbb{N}}\nnot a macro");
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="latex" /> },
      testData(),
    );
    expect(await screen.findByText(/^Line 2:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Macro" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fix in Raw" })).toBeTruthy();
    phoneSettings.reset("notes.latexMacros");
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

  it("turns haptics off for this phone under Appearance, on by default", async () => {
    writePreference(HAPTICS_PREFERENCE, true);
    const screen = await renderScreens(
      { index: () => <SettingsCategoryScreen page="appearance" /> },
      testData(),
    );
    expect(await screen.findByRole("header", { name: "This phone" })).toBeTruthy();
    const toggle = screen.getByLabelText("Haptics");
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, "valueChange", false);
    expect(readPreference(HAPTICS_PREFERENCE, hapticsPreference, true)).toBe(false);
    writePreference(HAPTICS_PREFERENCE, true);
  });

  it("lists the desktop's Vim keys for the sheet ? opens", () => {
    const screen = render(<VimKeys />);
    for (const group of ["Modes", "Move", "Edit"]) {
      expect(screen.getByLabelText(group)).toBeTruthy();
    }
    expect(screen.getByText("Delete a word (d with any motion)")).toBeTruthy();
  });
});
