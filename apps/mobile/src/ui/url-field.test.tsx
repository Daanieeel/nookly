import { fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { Text } from "react-native";
import { IconServer } from "@tabler/icons-react-native";
import { UrlField } from "./UrlField.tsx";

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <UrlField
        label="Server"
        icon={IconServer}
        placeholder="sync.example.com"
        value={value}
        onValueChange={setValue}
      />
      <Text testID="held">{value}</Text>
    </>
  );
}

describe("an address field", () => {
  it("shows https:// beside the icon and only the rest in the field", () => {
    const screen = render(<Harness initial="https://sync.example.com" />);
    expect(screen.getByText("https://")).toBeTruthy();
    expect(screen.getByLabelText("Server").props.value).toBe("sync.example.com");
  });

  it("holds the whole address for the form", () => {
    const screen = render(<Harness />);
    fireEvent.changeText(screen.getByLabelText("Server"), "sync.example.com");
    expect(screen.getByTestId("held").props.children).toBe("https://sync.example.com");
  });

  it("drops a pasted https:// instead of doubling it", () => {
    const screen = render(<Harness />);
    fireEvent.changeText(screen.getByLabelText("Server"), "https://sync.example.com/a");
    expect(screen.getByTestId("held").props.children).toBe("https://sync.example.com/a");
    expect(screen.getByLabelText("Server").props.value).toBe("sync.example.com/a");
  });

  it("switches to http:// when that is typed", () => {
    const screen = render(<Harness />);
    fireEvent.changeText(screen.getByLabelText("Server"), "http://");
    expect(screen.getByText("http://")).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Server"), "127.0.0.1:3100");
    expect(screen.getByTestId("held").props.children).toBe("http://127.0.0.1:3100");
  });

  it("opens the url keyboard without capitals or corrections", () => {
    const screen = render(<Harness />);
    const input = screen.getByLabelText("Server");
    expect(input.props.keyboardType).toBe("url");
    expect(input.props.autoCapitalize).toBe("none");
    expect(input.props.autoCorrect).toBe(false);
  });
});
