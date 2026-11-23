import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { ClipboardProvider } from "./clipboard.tsx";
import { BlurredSecret } from "./BlurredSecret.tsx";

const KEY = "GBTX GMSJ MR2W 6789";

describe("a blurred secret", () => {
  it("shows random characters of the same kind, blurred, until it is tapped", () => {
    const screen = render(<BlurredSecret value={KEY} label="key" />);
    const hidden = screen.getByTestId("secret-text");
    expect(hidden.props.children).not.toBe(KEY);
    expect(hidden.props.children).toMatch(/^[A-Z0-9]{4} [A-Z0-9]{4} [A-Z0-9]{4} [0-9]{4}$/);
    // Blurred: the glyphs are clear and only their shadow is drawn.
    expect(StyleSheet.flatten(hidden.props.style).color).toBe("transparent");
    expect(hidden.props.selectable).toBeFalsy();
    expect(screen.queryByText(KEY)).toBeNull();
    fireEvent.press(screen.getByLabelText("Show key"));
    expect(screen.getByTestId("secret-text").props.children).toBe(KEY);
    expect(screen.getByTestId("secret-text").props.selectable).toBe(true);
    fireEvent.press(screen.getByLabelText("Hide key"));
    expect(screen.getByTestId("secret-text").props.children).not.toBe(KEY);
  });

  it("copies the real secret even while it is blurred", async () => {
    const copy = jest.fn(async () => {});
    const screen = render(
      <ClipboardProvider value={{ copy }}>
        <BlurredSecret value={KEY} label="key" />
      </ClipboardProvider>,
    );
    fireEvent.press(screen.getByLabelText("Copy key"));
    expect(copy).toHaveBeenCalledWith(KEY);
  });
});
