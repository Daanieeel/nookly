import { render, screen } from "@testing-library/react-native";
import { type StyleProp, StyleSheet, Text, type ViewStyle } from "react-native";
import { IconButton } from "./Button.tsx";
import { Property } from "./Property.tsx";
import { AtAGlance, GlanceProvider, PartProvider } from "./parts.tsx";
import { Card } from "./kit/Card.tsx";
import { Tile } from "./kit/Tile.tsx";
import { RoundButton } from "./sheet/Floating.tsx";
import { Pill } from "./sheet/Compose.tsx";
import { LayoutTiles } from "./sheet/DisplayParts.tsx";

/// Whether a node is drawn with depth: a shadow stack under it, not a flat fill.
function raised(node: { props: { style?: StyleProp<ViewStyle> } }) {
  const { boxShadow } = StyleSheet.flatten(node.props.style);
  return Array.isArray(boxShadow) && boxShadow.length > 0;
}

describe("controls drawn with the raised look", () => {
  it("lifts the (i) icon button, the sheet's close button, a pill and a property chip", () => {
    render(
      <>
        <IconButton label="Details" icon={<Text>i</Text>} variant="secondary" onPress={() => {}} />
        <RoundButton label="Close" onPress={() => {}}>
          <Text>x</Text>
        </RoundButton>
        <Pill label="Priority" value={null} onPress={() => {}} />
        <PartProvider value="main">
          <GlanceProvider value>
            <AtAGlance>
              <Property label="Type" value="PDF" onPress={() => {}} />
            </AtAGlance>
          </GlanceProvider>
        </PartProvider>
      </>,
    );
    expect(raised(screen.getByRole("button", { name: "Details" }))).toBe(true);
    expect(raised(screen.getByRole("button", { name: "Close" }))).toBe(true);
    expect(raised(screen.getByRole("button", { name: "Priority, None" }))).toBe(true);
    expect(raised(screen.getByRole("button", { name: "Type, PDF" }))).toBe(true);
  });

  it("lifts a tile, a card and both layout tiles", () => {
    render(
      <>
        <Tile accessibilityLabel="Tasks" onPress={() => {}}>
          <Text>Tasks</Text>
        </Tile>
        <Card testID="card">
          <Text>Recipe</Text>
        </Card>
        <LayoutTiles
          tiles={[
            { id: "list", label: "List", icon: () => null },
            { id: "board", label: "Board", icon: () => null },
          ]}
          value="list"
          onSelect={() => {}}
        />
      </>,
    );
    expect(raised(screen.getByRole("button", { name: "Tasks" }))).toBe(true);
    expect(raised(screen.getByTestId("card"))).toBe(true);
    expect(raised(screen.getByRole("radio", { name: "List" }))).toBe(true);
    expect(raised(screen.getByRole("radio", { name: "Board" }))).toBe(true);
  });

  it("makes a pressable card a button and a plain card a view", () => {
    render(
      <>
        <Card onPress={() => {}} accessibilityLabel="Shakshuka">
          <Text>Shakshuka</Text>
        </Card>
        <Card testID="plain">
          <Text>Plain</Text>
        </Card>
      </>,
    );
    expect(screen.getByRole("button", { name: "Shakshuka" })).toBeTruthy();
    expect(screen.getByTestId("plain").props.accessibilityRole).toBeUndefined();
  });
});
