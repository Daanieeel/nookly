import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { IconValue } from "./icons.tsx";

describe("an emoji icon", () => {
  it("sits centred in a square of its size, with a line tall enough not to clip it", () => {
    const screen = render(<IconValue value="🎸" size={22} fallback="#3b82f6" />);
    const text = screen.getByText("🎸", { includeHiddenElements: true });
    const style = StyleSheet.flatten(text.props.style);
    expect(style.textAlign).toBe("center");
    expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize * 1.2);
    const box = StyleSheet.flatten(text.parent?.parent?.props.style);
    expect([box.width, box.height, box.alignItems, box.justifyContent]).toEqual([
      22,
      22,
      "center",
      "center",
    ]);
    // The system's text size must not push it out of its square.
    expect(text.props.allowFontScaling).toBe(false);
  });
});
