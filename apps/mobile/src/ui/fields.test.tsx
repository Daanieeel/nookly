import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { Field } from "./Field.tsx";
import { TextRow } from "./property-rows.tsx";

/// The name of a field sits small above what is typed, never at the start of its line,
/// where it reads as a placeholder (the user's notes).
function nameAbove(screen: ReturnType<typeof render>, name: string, input: string) {
  const label = screen.getByText(name);
  const size = StyleSheet.flatten(label.props.style).fontSize;
  expect(size).toBeLessThan(17);
  const field = screen.getByLabelText(input);
  // The name's column holds the field under it.
  let column = label.parent;
  while (column && !column.findAll((n) => n === field).length) column = column.parent;
  expect(StyleSheet.flatten(column?.props.style)?.flexDirection ?? "column").toBe("column");
}

describe("a text field", () => {
  it("has its name small above it", () => {
    const screen = render(<Field label="Title" value="" onChangeText={() => {}} />);
    nameAbove(screen, "Title", "Title");
  });

  it("may lead with an icon instead of a name", () => {
    const screen = render(
      <Field label="Title" icon={<Text>icon</Text>} value="" onChangeText={() => {}} />,
    );
    expect(screen.getByText("icon")).toBeTruthy();
    expect(screen.queryByText("Title")).toBeNull();
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });

  it("is focused by a tap anywhere on its row, its name included", () => {
    const screen = render(<Field label="Title" value="" onChangeText={() => {}} />);
    fireEvent.press(screen.getByText("Title"));
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });
});

describe("a property typed in place", () => {
  it("has its name small above the value", () => {
    const screen = render(<TextRow label="Room" value="B12" onSave={() => {}} />);
    nameAbove(screen, "Room", "Room");
  });
});
