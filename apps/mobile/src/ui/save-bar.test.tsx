import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SaveBar } from "./SaveBar.tsx";
import { PASTE_BAR } from "./FloatingField.tsx";
import { TINT } from "./tokens.ts";
import { CONTROL_SIZE } from "./touch.ts";

// Save View sat at the bottom of the Display sheet. As on the desktop, a bar floats at the
// bottom of the page once its filters or display change: Discard, Save as View where the
// page has Views, and Save.
describe("the save bar", () => {
  it("shows only while something changed", () => {
    render(<SaveBar dirty={false} onDiscard={() => {}} onSave={() => {}} />);
    expect(screen.queryByLabelText("Unsaved changes")).toBeNull();
  });

  it("discards or saves the change", async () => {
    const onDiscard = jest.fn();
    const onSave = jest.fn();
    const { rerender } = render(<SaveBar dirty onDiscard={onDiscard} onSave={onSave} />);
    expect(screen.getByLabelText("Unsaved changes")).toBeTruthy();
    // A page without Views offers Discard and Save only.
    expect(screen.queryByRole("button", { name: "Save as View" })).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalled();
    rerender(<SaveBar dirty={false} onDiscard={onDiscard} onSave={onSave} />);
    // It stays a moment to say it is saved.
    expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy();
  });

  it("names a new View on a page that has them", async () => {
    const onSaveAsView = jest.fn(() => Promise.resolve());
    render(<SaveBar dirty onDiscard={() => {}} onSave={() => {}} onSaveAsView={onSaveAsView} />);
    fireEvent.press(screen.getByRole("button", { name: "Save as View" }));
    fireEvent.changeText(await screen.findByLabelText("View name"), "Open work");
    fireEvent.press(screen.getByRole("button", { name: "Save View" }));
    await waitFor(() => expect(onSaveAsView).toHaveBeenCalledWith("Open work"));
  });

  it("has a card's corners, not a pill", () => {
    render(<SaveBar dirty onDiscard={() => {}} onSave={() => {}} />);
    const bar = StyleSheet.flatten(screen.getByTestId("save-bar").props.style);
    expect(bar.borderRadius).toBe(PASTE_BAR.radius);
    expect(bar.height).toBeUndefined();
  });

  it("gives Save a positive fill and an icon, and Discard red words", () => {
    render(<SaveBar dirty onDiscard={() => {}} onSave={() => {}} onSaveAsView={jest.fn()} />);
    const save = StyleSheet.flatten(screen.getByRole("button", { name: "Save" }).props.style);
    const discard = StyleSheet.flatten(screen.getByRole("button", { name: "Discard" }).props.style);
    expect(save.backgroundColor).toBeTruthy();
    expect(discard.backgroundColor).toBeUndefined();
    // Discard is a ghost button with red words, not an underlined link.
    const words = StyleSheet.flatten(screen.getByText("Discard").props.style);
    expect(words.textDecorationLine).toBeUndefined();
    expect(words.color).toBe(TINT.red.light);
    // Each button is as tall as the send button of the bar beside it (44), not the small size.
    for (const button of [save, discard]) expect(button.height).toBe(CONTROL_SIZE.default);
    // Each button is only as wide as it needs to be.
    expect(save.flex).toBeUndefined();
    expect(discard.flex).toBeUndefined();
  });
});
