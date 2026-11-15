import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { MIN_TOUCH } from "../touch.ts";
import { GroupedSection } from "./GroupedSection.tsx";
import { ListRow } from "./ListRow.tsx";
import { SEARCH_HEIGHT, SearchField } from "./SearchField.tsx";
import { semantic, semanticHex } from "../tokens.ts";
import { EmptyState, ErrorState, LoadingState } from "./States.tsx";

/// The base components every screen is built from: what a screen reader hears of them,
/// that a finger can hit them, and their empty, loading and error states.
describe("the base components", () => {
  it("a row reads its title, subtitle and detail, is a finger tall, and says when it is chosen", () => {
    const onPress = jest.fn();
    const screen = render(
      <ListRow
        title="Algorithms"
        subtitle="Prof. Ada"
        detail="CRS-1"
        accessory="check"
        accessibilityRole="radio"
        selected
        onPress={onPress}
      />,
    );
    const row = screen.getByRole("radio", { name: "Algorithms, Prof. Ada, CRS-1" });
    expect(row.props.accessibilityState).toMatchObject({ checked: true, selected: true });
    expect(StyleSheet.flatten(row.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH);
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it("a row puts its detail under the title when the text is very large", () => {
    const at = (fontScale: number) => {
      const window = { width: 390, height: 844, scale: 3, fontScale };
      // SAFETY: React Native's own module, whose default export is the hook.
      const hook = require("react-native/Libraries/Utilities/useWindowDimensions") as {
        default: () => typeof window;
      };
      const spy = jest.spyOn(hook, "default").mockReturnValue(window);
      const tree = render(<ListRow title="mira" detail="Synced at 17:19" />).toJSON();
      spy.mockRestore();
      return tree;
    };
    const stacked = at(2);
    const beside = at(1);
    // The row holds one column of text; at the default size the detail sits beside it.
    const count = (node: typeof stacked) =>
      node && !Array.isArray(node) ? (node.children ?? []).length : 0;
    expect(count(stacked)).toBe(1);
    expect(count(beside)).toBe(2);
  });

  it("a row without an action can not be pressed, and a disabled one says so", () => {
    const screen = render(<ListRow title="Read only" disabled />);
    expect(
      screen.getByRole("button", { name: "Read only" }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it("a grouped section names itself as a header, though it is drawn in capitals", () => {
    const screen = render(
      <GroupedSection title="Devices" footer="Every device signed in.">
        <ListRow title="iPhone" />
        <ListRow title="Mac" />
      </GroupedSection>,
    );
    expect(screen.getByRole("header", { name: "Devices" })).toBeTruthy();
    expect(screen.getByText("Every device signed in.")).toBeTruthy();
  });

  it("the search field is named and clears with a button", () => {
    const onChange = jest.fn();
    const screen = render(
      <SearchField label="Search Status" value="done" onChangeText={onChange} />,
    );
    expect(screen.getByLabelText("Search Status")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Clear Search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  // The small x inside the field was hard to hit. A full X button grows out of the field to
  // its right once something is typed: as tall as the field, square, in the field's fill.
  it("clears with a full button beside the field, in the field's fill", () => {
    const screen = render(
      <SearchField label="Search Items" value="plan" onChangeText={() => {}} />,
    );
    const button = screen.getByRole("button", { name: "Clear Search" });
    const style = StyleSheet.flatten(button.props.style);
    expect(style).toMatchObject({ width: SEARCH_HEIGHT, height: SEARCH_HEIGHT });
    expect(style.backgroundColor).toBe(
      StyleSheet.flatten(screen.getByTestId("search-field").props.style).backgroundColor,
    );
    // Beside the field, not inside it.
    let at = button.parent;
    while (at && at.props.testID !== "search-field") at = at.parent;
    expect(at).toBeNull();
  });

  it("has no clear button while nothing is typed", () => {
    const screen = render(<SearchField label="Search Items" value="" onChangeText={() => {}} />);
    expect(screen.queryByRole("button", { name: "Clear Search" })).toBeNull();
  });

  // The global search's bar felt cramped, and its placeholder and magnifier were see through:
  // the magnifier's handle showed the circle behind it. Taller, and drawn in a solid grey.
  it("the search field is roomy and draws its placeholder and icon solid", () => {
    const screen = render(<SearchField label="Search" value="" onChangeText={() => {}} />);
    expect(screen.getByTestId("search-field")).toHaveStyle({ minHeight: SEARCH_HEIGHT });
    expect(SEARCH_HEIGHT).toBeGreaterThan(MIN_TOUCH);
    const input = screen.getByLabelText("Search");
    expect(input.props.placeholderTextColor).toEqual(semantic("secondaryLabelSolid", "light"));
    expect(screen.getByTestId("search-icon").props.stroke).toBe(
      semanticHex("secondaryLabelSolid", "light"),
    );
    // Padding inside the input pushed the placeholder below the magnifier's middle.
    expect(StyleSheet.flatten(input.props.style).paddingVertical).toBe(0);
  });

  it("an empty state is a summary with its action", () => {
    const onPress = jest.fn();
    const screen = render(
      <EmptyState
        title="No Results"
        message="Nothing matches."
        action={{ label: "Clear", onPress }}
      />,
    );
    expect(screen.getByRole("summary", { name: "No Results. Nothing matches." })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Clear" }));
    expect(onPress).toHaveBeenCalled();
  });

  it("loading is a named progress indicator", () => {
    const screen = render(<LoadingState label="Loading tasks" />);
    expect(screen.getByRole("progressbar", { name: "Loading tasks" })).toBeTruthy();
  });

  it("an error is an alert with a way to try again", () => {
    const onRetry = jest.fn();
    const screen = render(<ErrorState message="The server did not answer." onRetry={onRetry} />);
    expect(
      screen.getByRole("alert", { name: "Something went wrong. The server did not answer." }),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
