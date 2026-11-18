import { render, screen, within } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { semantic } from "../tokens.ts";
import { Field } from "../Field.tsx";
import { DisplayGroup, LayoutTiles, SwitchRow } from "./DisplayParts.tsx";
import { Sheet } from "./Sheet.tsx";

// Options in a Display or Filter sheet sit on cards lighter than the sheet (D68), so they
// read as raised; they were a darker charcoal than the sheet around them.
describe("the parts of a Display or Filter sheet", () => {
  it("put their options on a card lighter than the sheet", () => {
    render(
      <DisplayGroup>
        <Text>Show sub-tasks</Text>
      </DisplayGroup>,
    );
    expect(screen.getByTestId("display-group")).toHaveStyle({
      backgroundColor: semantic("sheetCard", "light"),
    });
  });

  // The chosen tile is the raised one, the others quieter; it was darker than the rest.
  it("raise the chosen layout tile on the lighter card, the others quieter", () => {
    render(
      <LayoutTiles
        tiles={[
          { id: "list", label: "List", icon: () => null },
          { id: "board", label: "Board", icon: () => null },
        ]}
        value="list"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: "List" })).toHaveStyle({
      backgroundColor: semantic("sheetCard", "light"),
    });
    expect(screen.getByRole("radio", { name: "Board" })).toHaveStyle({
      backgroundColor: semantic("fill", "light"),
    });
  });

  // A bare switch was drawn at the top of its row, above its label's middle.
  it("centre a switch on its label", () => {
    render(<SwitchRow label="Show finished" value onChange={() => {}} />);
    const box = screen.getByTestId("switch-box");
    expect(box).toHaveStyle({ alignSelf: "center" });
    expect(within(box).getByLabelText("Show finished")).toBeTruthy();
  });

  // A field on a sheet (a view's name, a new item's title) was darker than the sheet.
  it("draw a field on a sheet lighter than the sheet, and on a page as before", () => {
    render(
      <>
        <Field label="On the page" value="" onChangeText={() => {}} />
        <Sheet open onOpenChange={() => {}} title="Display">
          <Field label="View name" value="" onChangeText={() => {}} />
        </Sheet>
      </>,
    );
    /// The fill behind a field: the nearest view above it that draws one.
    const fillOf = (label: string) => {
      let node = screen.getByLabelText(label).parent;
      while (node) {
        const style = StyleSheet.flatten(node.props.style ?? {});
        if (style.backgroundColor) return style.backgroundColor;
        node = node.parent;
      }
      return null;
    };
    expect(fillOf("View name")).toEqual(semantic("sheetCard", "light"));
    expect(fillOf("On the page")).toEqual(semantic("surface", "light"));
  });
});
