import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { FloatingField } from "../FloatingField.tsx";
import { TYPE } from "../tokens.ts";
import { lineInput } from "./line-input.ts";

// A line height on a one line field pushed its text and placeholder below the middle of the
// icon beside it (the paste bars, the palette, the sub-task row). The text of such a field
// takes its size only, so iOS centres it.
describe("a one line field beside an icon", () => {
  it("sets its size and nothing that moves the text off the middle", () => {
    const style = lineInput("callout");
    expect(style.fontSize).toBe(TYPE.callout.fontSize);
    expect(style).not.toHaveProperty("lineHeight");
    expect(style.paddingVertical).toBe(0);
  });

  it("is how the paste bar draws its text", () => {
    render(
      <FloatingField
        label="Paste a URL to save it"
        value=""
        onChangeText={() => {}}
        onSubmit={() => {}}
        sendLabel="Save Bookmark"
      />,
    );
    const style = StyleSheet.flatten(screen.getByLabelText("Paste a URL to save it").props.style);
    expect(style.lineHeight).toBeUndefined();
    expect(style.paddingVertical).toBe(0);
  });
});
