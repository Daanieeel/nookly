import { StyleSheet } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { MIN_TOUCH } from "../touch.ts";
import { ColorChoices } from "./ColorChoices.tsx";

function Picking({ none }: { none?: string }) {
  const [value, setValue] = useState<string | null>("#0070f3");
  return (
    <ColorChoices
      label="Color"
      colors={["#0070f3", "#00873d"]}
      value={value}
      onChange={setValue}
      none={none}
    />
  );
}

describe("colour choices", () => {
  it("are a radio group with the chosen colour checked, each a finger wide", () => {
    const screen = render(<Picking />);
    const blue = screen.getByRole("radio", { name: "Color #0070f3" });
    expect(blue.props.accessibilityState.checked).toBe(true);
    expect(
      screen.getByRole("radio", { name: "Color #00873d" }).props.accessibilityState.checked,
    ).toBe(false);
    expect(StyleSheet.flatten(blue.props.style)).toMatchObject({
      width: MIN_TOUCH,
      height: MIN_TOUCH,
    });
    fireEvent.press(screen.getByRole("radio", { name: "Color #00873d" }));
    expect(
      screen.getByRole("radio", { name: "Color #00873d" }).props.accessibilityState.checked,
    ).toBe(true);
  });

  it("offer no colour first when asked", () => {
    const screen = render(<Picking none="No tint" />);
    fireEvent.press(screen.getByRole("radio", { name: "No tint" }));
    expect(screen.getByRole("radio", { name: "No tint" }).props.accessibilityState.checked).toBe(
      true,
    );
  });
});
