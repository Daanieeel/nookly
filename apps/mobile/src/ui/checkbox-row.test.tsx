import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, Text, View } from "react-native";
import { CheckboxRow } from "./CheckboxRow.tsx";
import { SOLID } from "./tokens.ts";

describe("a checkbox row", () => {
  it("is a checkbox with its state, and toggles when pressed", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <CheckboxRow checked={false} onChange={onChange} label="I agree">
        <Text>I agree</Text>
      </CheckboxRow>,
    );
    const box = screen.getByRole("checkbox", { name: "I agree" });
    expect(box.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(
      <CheckboxRow checked onChange={onChange} label="I agree">
        <Text>I agree</Text>
      </CheckboxRow>,
    );
    expect(
      screen.getByRole("checkbox", { name: "I agree" }).props.accessibilityState,
    ).toMatchObject({
      checked: true,
    });
    fireEvent.press(screen.getByRole("checkbox", { name: "I agree" }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it("is as tall as a finger", () => {
    render(
      <CheckboxRow checked={false} onChange={() => {}} label="I agree">
        <Text>I agree</Text>
      </CheckboxRow>,
    );
    const style = StyleSheet.flatten(screen.getByRole("checkbox", { name: "I agree" }).props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  it("says what is wrong under it", () => {
    render(
      <CheckboxRow checked={false} onChange={() => {}} label="I agree" error="Agree first">
        <Text>I agree</Text>
      </CheckboxRow>,
    );
    expect(screen.getByText("Agree first")).toBeTruthy();
  });

  it("does nothing while disabled", () => {
    const onChange = jest.fn();
    render(
      <CheckboxRow checked={false} onChange={onChange} label="I agree" disabled>
        <Text>I agree</Text>
      </CheckboxRow>,
    );
    fireEvent.press(screen.getByRole("checkbox", { name: "I agree" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fills in the colour of a warning when what it asks for is one", () => {
    const row = (checked: boolean) => (
      <CheckboxRow severity="warning" checked={checked} onChange={() => {}} label="Keep a copy">
        <Text>Keep a copy</Text>
      </CheckboxRow>
    );
    const filled = () =>
      screen
        .UNSAFE_queryAllByType(View)
        .filter(
          (view) => StyleSheet.flatten(view.props.style)?.backgroundColor === SOLID.warning.light,
        );
    const { rerender } = render(row(false));
    expect(filled()).toHaveLength(0);
    rerender(row(true));
    expect(filled()).toHaveLength(1);
  });
});
