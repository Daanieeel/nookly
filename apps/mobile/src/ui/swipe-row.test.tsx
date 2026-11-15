import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { SwipeRow } from "./SwipeRow.tsx";

function row() {
  const actions = {
    pin: jest.fn(),
    more: jest.fn(),
    trash: jest.fn(),
  };
  render(
    <SwipeRow
      leading={[{ label: "Pin", tone: "warning", onPress: actions.pin }]}
      trailing={[
        { label: "More", tone: "neutral", onPress: actions.more },
        { label: "Trash", tone: "destructive", onPress: actions.trash },
      ]}
    >
      <Text>Row</Text>
    </SwipeRow>,
  );
  fireEvent(screen.getByTestId("swipe-row"), "layout", {
    nativeEvent: { layout: { width: 400, height: 56, x: 0, y: 0 } },
  });
  return actions;
}

const swipe = (to: number, velocityX = 0) =>
  fireGestureHandler(getByGestureTestId("swipe-row"), [
    { state: State.BEGAN },
    { state: State.ACTIVE, translationX: to / 2 },
    { state: State.ACTIVE, translationX: to },
    { state: State.END, translationX: to, velocityX },
  ]);

// Every list's rows swipe as Mail's: a side holds one action or several side by side, and
// right to left always ends in Trash, the rightmost, which a long drag runs.
describe("a swipe row", () => {
  it("shows a side's actions side by side, Trash rightmost", async () => {
    row();
    swipe(-120);
    const names = (await screen.findAllByRole("button")).map((b) => b.props.accessibilityLabel);
    expect(names.filter((n) => n === "More" || n === "Trash")).toEqual(["More", "Trash"]);
  });

  it("runs the outermost action on a long drag, and nothing else", async () => {
    const actions = row();
    swipe(-360);
    await waitFor(() => expect(actions.trash).toHaveBeenCalledTimes(1));
    expect(actions.more).not.toHaveBeenCalled();
  });

  it("runs the first leading action on a long drag the other way", async () => {
    const actions = row();
    swipe(360);
    await waitFor(() => expect(actions.pin).toHaveBeenCalledTimes(1));
    expect(actions.trash).not.toHaveBeenCalled();
  });

  it("rests open on a short drag, running nothing", () => {
    const actions = row();
    swipe(-120);
    expect(actions.trash).not.toHaveBeenCalled();
    expect(actions.more).not.toHaveBeenCalled();
  });

  it("offers every action to screen readers", () => {
    const actions = row();
    const target = screen.UNSAFE_root.findAll((node) => node.props.onAccessibilityAction)[0];
    expect(target.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      "Pin",
      "More",
      "Trash",
    ]);
    fireEvent(target, "accessibilityAction", { nativeEvent: { actionName: "More" } });
    expect(actions.more).toHaveBeenCalledTimes(1);
  });
});
