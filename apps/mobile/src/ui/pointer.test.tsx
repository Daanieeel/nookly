import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Row } from "./Row.tsx";

// A pointer on an iPad (10.2): a row lights up under it, as on the desktop, and a secondary
// click opens the row's menu, the desktop's right click.
describe("a row under a pointer", () => {
  it("lights up while the pointer is over it", () => {
    const screen = render(<Row title="Plan" onPress={() => {}} />);
    const row = screen.getByRole("button", { name: "Plan" });
    const fill = () => StyleSheet.flatten(row.props.style).backgroundColor;
    expect(fill()).toBeUndefined();
    fireEvent(row, "hoverIn");
    expect(fill()).toBeDefined();
    fireEvent(row, "hoverOut");
    expect(fill()).toBeUndefined();
  });

  it("opens its menu on a secondary click", () => {
    const menu = jest.fn();
    const screen = render(<Row title="Plan" onPress={() => {}} onLongPress={menu} />);
    fireEvent(screen.getByRole("button", { name: "Plan" }), "pointerDown", {
      nativeEvent: { button: 2 },
    });
    expect(menu).toHaveBeenCalledTimes(1);
  });
});
