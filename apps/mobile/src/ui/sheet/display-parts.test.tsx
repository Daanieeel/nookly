import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { semantic } from "../tokens.ts";
import { DisplayGroup, LayoutTiles } from "./DisplayParts.tsx";

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

  it("draw a layout tile that is not chosen on the same lighter card", () => {
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
    expect(screen.getByRole("radio", { name: "Board" })).toHaveStyle({
      backgroundColor: semantic("sheetCard", "light"),
    });
  });
});
