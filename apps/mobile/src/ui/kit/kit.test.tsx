import { IconPlus, IconUsers } from "@tabler/icons-react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { MIN_TOUCH } from "../touch.ts";
import { GroupedSection } from "./GroupedSection.tsx";
import { ListRow } from "./ListRow.tsx";
import { SearchField } from "./SearchField.tsx";
import { EmptyState, ErrorState, LoadingState } from "./States.tsx";
import { INTERFACE_SYMBOLS, UiIcon } from "./UiIcon.tsx";

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

  it("interface icons have an SF Symbol; one without falls back to Tabler", () => {
    expect(INTERFACE_SYMBOLS.get(IconPlus)).toBe("plus");
    expect(INTERFACE_SYMBOLS.get(IconUsers)).toBe("person.2");
    expect(() => render(<UiIcon icon={IconPlus} size={16} color="#ffffff" />)).not.toThrow();
  });
});
