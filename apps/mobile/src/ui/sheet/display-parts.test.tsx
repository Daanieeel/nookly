import { render, screen, within } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { PRIMARY, semantic } from "../tokens.ts";
import { Field } from "../Field.tsx";
import { DisplayGroup, LayoutTiles, SwitchRow } from "./DisplayParts.tsx";
import { Sheet } from "./Sheet.tsx";

// Options in a Display or Filter sheet sit on cards lighter than the sheet (D68), so they
// read as raised; they were a darker charcoal than the sheet around them.
describe("the parts of a Display or Filter sheet", () => {
  it("put each option on its own raised card lighter than the sheet, not one slab", () => {
    render(
      <DisplayGroup>
        <Text>Show sub-tasks</Text>
        <Text>Show completed</Text>
      </DisplayGroup>,
    );
    const cards = screen.getAllByTestId("display-card");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card).toHaveStyle({ backgroundColor: semantic("sheetCard", "light") });
      expect(StyleSheet.flatten(card.props.style).boxShadow).toBeDefined();
    }
  });

  // Both tiles are raised controls, but the chosen one wore only a different icon colour, easy
  // to miss: it takes the accent's edge and a wash of it.
  it("raise both layout tiles alike, and mark the chosen one with the accent", () => {
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
    const style = (name: string) =>
      StyleSheet.flatten(screen.getByRole("radio", { name }).props.style);
    const shadows = (name: string) => {
      const { boxShadow } = style(name);
      return Array.isArray(boxShadow) ? boxShadow.length : 0;
    };
    expect(shadows("Board")).toBeGreaterThan(0);
    expect(shadows("List")).toBe(shadows("Board"));
    expect(style("List").borderColor).toBe(PRIMARY);
    expect(style("Board").borderColor).not.toBe(PRIMARY);
    expect(style("List").backgroundColor).not.toBe(style("Board").backgroundColor);
  });

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
    expect(fillOf("On the page")).toEqual(semantic("raised", "light"));
  });
});
