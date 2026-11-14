import { act, fireEvent } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { EditorToolbar } from "./EditorToolbar.tsx";
import { useToolbar } from "./toolbar-store.ts";

describe("the editor's toolbar", () => {
  // The web view's own bar (up, down, a check) is hidden, so this one carries the way
  // out of the keyboard.
  it("hides the keyboard from its own button", async () => {
    const run = jest.fn();
    const screen = await renderScreens({ index: () => <EditorToolbar /> }, testData());
    act(() => useToolbar.getState().set({ focused: true, on: {} }, run));
    await fireEvent.press(await screen.findByRole("button", { name: "Hide Keyboard" }));
    expect(run).toHaveBeenCalledWith("done");
  });

  it("has buttons a finger can hit, 44 points or more", async () => {
    const screen = await renderScreens({ index: () => <EditorToolbar /> }, testData());
    act(() => useToolbar.getState().set({ focused: true, on: {} }, jest.fn()));
    const bold = await screen.findByRole("button", { name: "Bold" });
    const style = Object.assign({}, ...[bold.props.style].flat(3).filter(Boolean));
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
  });

  it("draws a button that would do nothing as disabled (indent the first item)", async () => {
    const run = jest.fn();
    const screen = await renderScreens({ index: () => <EditorToolbar /> }, testData());
    act(() =>
      useToolbar.getState().set({ focused: true, on: {}, off: { indent: true, undo: true } }, run),
    );
    const indent = await screen.findByRole("button", { name: "Indent" });
    expect(indent.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(indent);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Outdent" }).props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });
});
