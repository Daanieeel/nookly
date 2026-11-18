import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Property } from "./Property.tsx";

// A long value (three labels on a file) squeezed the property's own name: "Labels" read
// "La…". The name keeps its width; only the value is cut short.
describe("a property with a long value", () => {
  it("never cuts its name, only the value", () => {
    const screen = render(
      <Property
        label="Labels"
        value="Lecture notes, Exam preparation, Reading list"
        onPress={() => {}}
      />,
    );
    const name = StyleSheet.flatten(screen.getByText("Labels").props.style);
    expect(name.flexShrink).toBe(0);
    const value = StyleSheet.flatten(
      screen.getByText("Lecture notes, Exam preparation, Reading list").props.style,
    );
    expect(value.flexShrink).toBe(1);
  });
});
