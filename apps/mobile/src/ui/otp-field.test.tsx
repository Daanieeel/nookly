import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { OtpField } from "./OtpField.tsx";
import { PRIMARY, TINT } from "./tokens.ts";

const boxes = (screen: ReturnType<typeof render>) => screen.getAllByTestId(/^otp-box-/);
const edge = (box: ReactTestInstance) => StyleSheet.flatten(box.props.style).borderColor;

describe("a one time code field", () => {
  it("draws one box per digit and fills them from what is typed", () => {
    const screen = render(<OtpField label="Code" value="12" onChange={() => {}} />);
    expect(boxes(screen)).toHaveLength(6);
    expect(screen.getByTestId("otp-box-0")).toHaveTextContent("1");
    expect(screen.getByTestId("otp-box-1")).toHaveTextContent("2");
    expect(screen.getByTestId("otp-box-2")).toHaveTextContent("");
  });

  it("keeps digits only, six at most, and says when the last one is in", () => {
    const onChange = jest.fn();
    const onComplete = jest.fn();
    const screen = render(
      <OtpField label="Code" value="" onChange={onChange} onComplete={onComplete} />,
    );
    fireEvent.changeText(screen.getByLabelText("Code"), "12a3 456789");
    expect(onChange).toHaveBeenCalledWith("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
    onComplete.mockClear();
    fireEvent.changeText(screen.getByLabelText("Code"), "123");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("is one field to a screen reader, filled in by the system's code suggestion", () => {
    const screen = render(<OtpField label="Code" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Code");
    expect(input.props.textContentType).toBe("oneTimeCode");
    expect(input.props.keyboardType).toBe("number-pad");
    expect(input.props.maxLength).toBe(6);
    // The boxes are drawing, not controls.
    expect(screen.getByTestId("otp-box-0").props.accessible).toBeFalsy();
  });

  it("lights the box the next digit goes in while focused", () => {
    const screen = render(<OtpField label="Code" value="12" onChange={() => {}} />);
    expect(edge(screen.getByTestId("otp-box-2"))).not.toBe(PRIMARY);
    fireEvent(screen.getByLabelText("Code"), "focus");
    expect(edge(screen.getByTestId("otp-box-2"))).toBe(PRIMARY);
    expect(edge(screen.getByTestId("otp-box-0"))).not.toBe(PRIMARY);
  });

  it("turns every box red when the code is wrong", () => {
    const screen = render(<OtpField label="Code" value="" invalid onChange={() => {}} />);
    for (const box of boxes(screen)) expect(edge(box)).toBe(TINT.red.light);
  });
});
