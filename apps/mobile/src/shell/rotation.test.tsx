import { createSpace } from "@nookly/shared/data";
import { act, fireEvent } from "expo-router/testing-library";
import { StyleSheet } from "react-native";
import Task from "../app/new/task.tsx";
import { renderScreens, testData } from "../test/render.tsx";
import { setWindowOverride } from "../ui/window-override.ts";

const LANDSCAPE = { width: 1376, height: 1032 };
const PORTRAIT = { width: 1032, height: 1376 };
const SLIDE_OVER = { width: 375, height: 1133 };

afterEach(() => act(() => setWindowOverride(null)));

/// The window turns, or narrows into Slide Over, while a form is half written (12.2).
async function halfWrittenTask() {
  act(() => setWindowOverride(LANDSCAPE));
  const data = testData();
  const space = await createSpace(data.db, "Uni", "#3b82f6");
  const screen = await renderScreens(
    { index: () => null, "new/task": Task },
    data,
    `/new/task?spaceId=${space}`,
  );
  await fireEvent.changeText(await screen.findByLabelText("Task title"), "Call the den");
  return screen;
}

describe("turning the window", () => {
  it("keeps a half written form, still a dialog, from landscape to portrait", async () => {
    const screen = await halfWrittenTask();
    expect(StyleSheet.flatten(screen.getByTestId("sheet-dialog").props.style).width).toBe(560);
    act(() => setWindowOverride(PORTRAIT));
    expect(StyleSheet.flatten(screen.getByTestId("sheet-dialog").props.style).width).toBe(560);
    expect(screen.getByLabelText("Task title").props.value).toBe("Call the den");
  });

  // It emptied the form: the dialog became the phone's sheet, a new frame around it.
  it("keeps it, a dialog that fits, when the window narrows to the phone's width", async () => {
    const screen = await halfWrittenTask();
    act(() => setWindowOverride(SLIDE_OVER));
    expect(StyleSheet.flatten(screen.getByTestId("sheet-dialog").props.style).width).toBe(327);
    expect(screen.getByLabelText("Task title").props.value).toBe("Call the den");
    act(() => setWindowOverride(LANDSCAPE));
    expect(screen.getByTestId("sheet-dialog")).toBeTruthy();
    expect(screen.getByLabelText("Task title").props.value).toBe("Call the den");
  });
});
