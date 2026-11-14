import { render } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { ReorderList } from "./ReorderList.tsx";

describe("a row of icons to put in order", () => {
  // The bug: the sidebar's Space icons sat half a row lower than + and Trash beside them,
  // as each icon's box had a width but no height of its own.
  it("gives each icon a square box, so the row lines up with the buttons beside it", () => {
    const screen = render(
      <ReorderList
        horizontal
        items={["a", "b"]}
        keyOf={(id) => id}
        labelOf={(id) => id}
        size={44}
        onReorder={() => {}}
        renderItem={(id) => <Text>{id}</Text>}
      />,
    );
    const box = screen.getByLabelText("a, drag to reorder");
    expect(StyleSheet.flatten(box.props.style)).toMatchObject({ width: 44, height: 44 });
  });
});
