import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  WindowSizeProvider,
  orientationOf,
  useIsTablet,
  useOrientation,
  useWindowClass,
  windowClassOf,
} from "./pane.tsx";

// The layout follows the window, never the device: Slide Over, a Stage Manager window and
// a rotated iPad are each their own width (D83).
describe("window classes", () => {
  it.each([
    [320, "compact"],
    [599, "compact"],
    [600, "medium"],
    [999, "medium"],
    [1000, "expanded"],
    [1376, "expanded"],
  ])("a window %i wide is %s", (width, expected) => {
    expect(windowClassOf(width)).toBe(expected);
  });

  // Points, portrait then landscape.
  it.each([
    ["iPad mini", 744, 1133, "medium", "expanded"],
    ["iPad 11-inch", 820, 1180, "medium", "expanded"],
    ["iPad Pro 11-inch", 834, 1210, "medium", "expanded"],
    ["iPad Air 13-inch", 1024, 1366, "expanded", "expanded"],
    ["iPad Pro 13-inch", 1032, 1376, "expanded", "expanded"],
  ])("an %s is %s in portrait and %s in landscape", (_, short, long, portrait, landscape) => {
    expect(windowClassOf(short)).toBe(portrait);
    expect(windowClassOf(long)).toBe(landscape);
  });

  it("names the orientation from the window's sides", () => {
    expect(orientationOf({ width: 834, height: 1194 })).toBe("portrait");
    expect(orientationOf({ width: 1376, height: 1032 })).toBe("landscape");
    // A square window, as Stage Manager allows, counts as portrait.
    expect(orientationOf({ width: 800, height: 800 })).toBe("portrait");
  });

  it("reads a test's window size", () => {
    function Probe() {
      return (
        <Text>
          {useWindowClass()} {useOrientation()} {String(useIsTablet())}
        </Text>
      );
    }
    const mini = render(
      <WindowSizeProvider value={{ width: 744, height: 1133 }}>
        <Probe />
      </WindowSizeProvider>,
    );
    // The iPad mini is a tablet, which the old 768 wide rule missed.
    expect(mini.getByText("medium portrait true")).toBeTruthy();
    const wide = render(
      <WindowSizeProvider value={{ width: 1376, height: 1032 }}>
        <Probe />
      </WindowSizeProvider>,
    );
    expect(wide.getByText("expanded landscape true")).toBeTruthy();
    const phone = render(
      <WindowSizeProvider value={{ width: 402, height: 874 }}>
        <Probe />
      </WindowSizeProvider>,
    );
    expect(phone.getByText("compact portrait false")).toBeTruthy();
  });
});
