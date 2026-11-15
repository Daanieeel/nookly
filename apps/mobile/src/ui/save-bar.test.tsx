import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SaveBar } from "./SaveBar.tsx";
import { pasteBarCorners, screenCornerRadius } from "./FloatingField.tsx";

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

  it("is a pill in the screen's corners, like the paste bars", () => {
    render(<SaveBar dirty onDiscard={() => {}} onSave={() => {}} />);
    const bar = StyleSheet.flatten(screen.getByTestId("save-bar").props.style);
    const corners = pasteBarCorners(screenCornerRadius({ width: 750, height: 1334 }));
    expect(bar.borderRadius).toBe(corners.top);
    expect(bar.height).toBe(corners.height);
  });
});
