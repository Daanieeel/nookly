import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text, type TextProps } from "react-native";
import { Button, IconButton } from "./Button.tsx";
import { semanticHex } from "./tokens.ts";

// The (i) on a bookmark was a faint ghost icon, hard to hit and easy to miss. As a secondary
// button it sits on a gray circle, the size of a fingertip.
// Stands for a Tabler icon: draws its colour as text.
function Icon({ color, ...props }: TextProps & { color?: string }) {
  return <Text {...props}>{color}</Text>;
}

describe("a secondary icon button", () => {
  it("is drawn on a raised circle, as big as a finger", () => {
    render(
      <IconButton label="Details" icon={<Text>i</Text>} variant="secondary" onPress={() => {}} />,
    );
    const style = StyleSheet.flatten(screen.getByRole("button", { name: "Details" }).props.style);
    expect(style.backgroundColor).toBe(semanticHex("raised", "light"));
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.borderRadius).toBe(style.width / 2);
  });

  it("stays plain by default", () => {
    render(<IconButton label="Details" icon={<Text>i</Text>} onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByRole("button", { name: "Details" }).props.style);
    expect(style.backgroundColor).toBeUndefined();
  });
});

// An icon in a coloured button is the label's colour, whatever colour the caller gave it: a red
// trash icon in a red "Move to Trash" button was unreadable.
describe("a button's icon", () => {
  it("takes the label's colour", () => {
    render(
      <Button
        label="Move to Trash"
        variant="destructive"
        icon={<Icon testID="icon" color="#ff0000" />}
        onPress={() => {}}
      />,
    );
    expect(screen.getByTestId("icon").props.children).toBe("#ffffff");
  });
});
