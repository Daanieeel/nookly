import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { Row } from "./Row.tsx";
import { Screen } from "./Screen.tsx";
import { SwipeRow } from "./SwipeRow.tsx";
import { Sheet } from "./sheet/Sheet.tsx";

const style = (label: string) =>
  StyleSheet.flatten(screen.getByRole("button", { name: label }).props.style);

// The page's padding sat on the list, so a pressed row's colour and its swipe actions
// stopped short of the screen's edges. Rows reach the edges; what they show stays in line.
describe("a list row's edges", () => {
  it("reaches the screen's edges on a page, its content padded back in line", () => {
    render(
      <Screen>
        <Row title="Buy milk" onPress={() => {}} />
      </Screen>,
    );
    expect(style("Buy milk")).toMatchObject({ marginHorizontal: -16, paddingHorizontal: 20 });
  });

  it("stays inside a sheet, which pads nothing", async () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Pick">
        <Row title="Buy milk" onPress={() => {}} />
      </Sheet>,
    );
    await screen.findByText("Buy milk");
    expect(style("Buy milk")).toMatchObject({ marginHorizontal: 0, paddingHorizontal: 4 });
  });

  it("in a swipe row, the swipe row reaches the edges and the row only pads", () => {
    render(
      <Screen>
        <SwipeRow left={{ label: "Done", tone: "positive", onPress: () => {} }}>
          <Row title="Buy milk" onPress={() => {}} />
        </SwipeRow>
      </Screen>,
    );
    expect(style("Buy milk")).toMatchObject({ marginHorizontal: 0, paddingHorizontal: 20 });
  });

  // A list mounted every row's hidden actions, a third of each row's views, for nothing
  // until a finger swipes. They appear once a swipe starts.
  it("builds its actions only once a swipe starts, then shows them named", async () => {
    const onPress = jest.fn();
    render(
      <SwipeRow right={{ label: "Trash", tone: "destructive", onPress }}>
        <Text>Row</Text>
      </SwipeRow>,
    );
    expect(screen.queryByRole("button", { name: "Trash" })).toBeNull();
    fireGestureHandler(getByGestureTestId("swipe-row"), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: -40 },
      { state: State.END, translationX: -60, velocityX: 0 },
    ]);
    expect(await screen.findByRole("button", { name: "Trash" })).toBeTruthy();
  });
});
