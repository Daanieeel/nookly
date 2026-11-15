import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
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
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("swipe actions show their icon and name", () => {
    render(
      <SwipeRow right={{ label: "Trash", tone: "destructive", onPress: () => {} }}>
        <Text>Row</Text>
      </SwipeRow>,
    );
    expect(screen.getByRole("button", { name: "Trash" })).toBeTruthy();
  });
});
