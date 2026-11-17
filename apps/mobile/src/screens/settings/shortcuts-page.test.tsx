import { act, fireEvent, waitFor } from "expo-router/testing-library";
import { writePreference } from "../../data/preferences.ts";
import { KEY_CHANGES, type KeyRecorder, type Keys } from "../../shell/shortcut-keys.ts";
import { renderScreens, testData } from "../../test/render.tsx";
import { ShortcutsPage } from "./ShortcutsPage.tsx";

/// A keyboard the test connects and presses keys on.
function fakeKeyboard(connected = true) {
  let recording: ((keys: Keys) => void) | null = null;
  const keys: KeyRecorder = {
    hasKeyboard: () => connected,
    onKeyboardChange: () => () => {},
    record: (listener) => {
      recording = listener;
      return () => {
        recording = null;
      };
    },
  };
  const press = (key: string, ...modifiers: Keys["modifiers"]) =>
    act(() => recording?.({ key, modifiers }));
  return { keys, press, recording: () => recording !== null };
}

async function setup(connected = true) {
  const keyboard = fakeKeyboard(connected);
  const screen = await renderScreens(
    { index: () => <ShortcutsPage keys={keyboard.keys} /> },
    testData(),
    "/",
    { width: 1194 },
  );
  return { screen, ...keyboard };
}

beforeEach(() => writePreference(KEY_CHANGES, []));

// The tablet's Shortcuts were a list to read. Now they change as the desktop's do (8.6):
// press a row, press the new keys.
describe("changing a keyboard shortcut", () => {
  it("takes the next keys pressed, and puts Nookly's back with Reset", async () => {
    const { screen, press, recording } = await setup();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change Search shortcut, now ⌘K" }),
    );
    expect(recording()).toBe(true);
    expect(screen.getByText("Press a Shortcut")).toBeTruthy();
    press("j", "command", "shift");
    expect(
      await screen.findByRole("button", { name: "Change Search shortcut, now ⇧⌘J" }),
    ).toBeTruthy();
    expect(recording()).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Reset Search" }));
    expect(
      await screen.findByRole("button", { name: "Change Search shortcut, now ⌘K" }),
    ).toBeTruthy();
  });

  it("asks for a modifier, and stops listening on Escape", async () => {
    const { screen, press, recording } = await setup();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change Search shortcut, now ⌘K" }),
    );
    press("j");
    expect(
      await screen.findByText("Hold Command, Control or Option together with the key."),
    ).toBeTruthy();
    expect(recording()).toBe(true);
    press("UIKeyInputEscape");
    await waitFor(() => expect(recording()).toBe(false));
    expect(screen.getByRole("button", { name: "Change Search shortcut, now ⌘K" })).toBeTruthy();
  });

  it("never takes a key with a fixed meaning", async () => {
    const { screen, press } = await setup();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change Search shortcut, now ⌘K" }),
    );
    press("c", "command");
    expect(await screen.findByText('⌘C is used for "Copy", which can\'t be changed.')).toBeTruthy();
    expect(screen.getByRole("header", { name: "Fixed Shortcuts" })).toBeTruthy();
  });

  it("asks before moving a key from another shortcut, which is left without one", async () => {
    const { screen, press } = await setup();
    await fireEvent.press(
      await screen.findByRole("button", { name: "Change Search shortcut, now ⌘K" }),
    );
    press("p", "command");
    expect(await screen.findByText("Reassign ⌘P to Search?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Reassign" }));
    expect(
      await screen.findByRole("button", { name: "Change Search shortcut, now ⌘P" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Change Quick Open shortcut, not set" }),
    ).toBeTruthy();
  });

  it("resets every changed shortcut after asking", async () => {
    const { screen, press } = await setup();
    const all = await screen.findByRole("button", { name: "Reset All Shortcuts" });
    expect(all).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Change Search shortcut, now ⌘K" }));
    press("j", "command", "shift");
    await fireEvent.press(await screen.findByRole("button", { name: "Reset All Shortcuts" }));
    expect(await screen.findByText("Reset all shortcuts?")).toBeTruthy();
    // The question's Reset, after the changed row's own.
    const reset = screen.getAllByRole("button", { name: "Reset" }).at(-1);
    if (reset) await fireEvent.press(reset);
    expect(
      await screen.findByRole("button", { name: "Change Search shortcut, now ⌘K" }),
    ).toBeTruthy();
  });

  it("is a list to read without a keyboard, and says why", async () => {
    const { screen } = await setup(false);
    expect(await screen.findByText(/Connect a keyboard to change these\./)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Change Search shortcut/ })).toBeNull();
    expect(screen.getByText("⌘K")).toBeTruthy();
  });
});
