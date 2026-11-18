import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { IconButton } from "./Button.tsx";
import { semanticHex } from "./tokens.ts";

// The (i) on a bookmark was a faint ghost icon, hard to hit and easy to miss. As a secondary
// button it sits on a gray circle, the size of a fingertip.
describe("a secondary icon button", () => {
  it("is drawn on a gray circle, as big as a finger", () => {
    render(
      <IconButton label="Details" icon={<Text>i</Text>} variant="secondary" onPress={() => {}} />,
    );
    const style = StyleSheet.flatten(screen.getByRole("button", { name: "Details" }).props.style);
    expect(style.backgroundColor).toBe(semanticHex("fill", "light"));
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.borderRadius).toBe(style.width / 2);
  });

  it("stays plain by default", () => {
    render(<IconButton label="Details" icon={<Text>i</Text>} onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByRole("button", { name: "Details" }).props.style);
    expect(style.backgroundColor).toBeUndefined();
  });
});
