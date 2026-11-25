import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Modal, Text, TextInput } from "react-native";
import { WindowSizeProvider } from "../pane.tsx";
import { topLayer } from "./layers.ts";
import { Sheet, useSheet } from "./Sheet.tsx";

// The sheet animates in and out on timers, which take longer when every suite runs at once.
jest.setTimeout(20_000);

const TABLET = { width: 1376, height: 1032 };

function Done() {
  const sheet = useSheet();
  return <Text onPress={() => sheet?.close()}>Done here</Text>;
}

function Locked() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Text>{open ? "open" : "closed"}</Text>
      <Sheet open={open} onOpenChange={setOpen} title="Required" locked>
        <Done />
      </Sheet>
    </>
  );
}

describe("a sheet that has to be answered", () => {
  it("has no way out by tapping outside or the system's back", () => {
    const screen = render(<Locked />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(screen.getByText("open")).toBeTruthy();
  });

  it("has no close button or Escape on a tablet either", () => {
    const screen = render(
      <WindowSizeProvider value={TABLET}>
        <Locked />
      </WindowSizeProvider>,
    );
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    act(() => topLayer()?.close());
    expect(screen.getByText("open")).toBeTruthy();
  });

  it("still closes when what it asks for is done", async () => {
    const screen = render(<Locked />);
    fireEvent.press(screen.getByText("Done here"));
    await waitFor(() => expect(screen.getByText("closed")).toBeTruthy());
  });
});

/// A form that raises a question over itself.
function Asking() {
  const [typed, setTyped] = useState("");
  const [asking, setAsking] = useState(false);
  return (
    <>
      <TextInput accessibilityLabel="Draft" value={typed} onChangeText={setTyped} />
      <Text onPress={() => setAsking(true)}>Ask</Text>
      <Sheet open={asking} onOpenChange={setAsking} title="Sure?" stacked>
        <Done />
      </Sheet>
    </>
  );
}

describe("a question over a sheet", () => {
  it("floats in a window of its own, and what is under it keeps what was typed", async () => {
    const screen = render(
      <Sheet open onOpenChange={() => {}} title="Form">
        <Asking />
      </Sheet>,
    );
    fireEvent.changeText(screen.getByLabelText("Draft"), "half written");
    fireEvent.press(screen.getByText("Ask"));
    expect(await screen.findByText("Done here")).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType(Modal)).toHaveLength(2);
    expect(screen.getByLabelText("Draft").props.value).toBe("half written");
    fireEvent.press(screen.getByText("Done here"));
    await waitFor(() => expect(screen.queryByText("Done here")).toBeNull());
    expect(screen.getByLabelText("Draft").props.value).toBe("half written");
  });
});
