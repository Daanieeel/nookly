import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { type ReactNode, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WindowSizeProvider } from "../pane.tsx";
import { OptionList } from "./OptionList.tsx";
import { Sheet } from "./Sheet.tsx";
import { pointAnchor } from "./anchor.ts";
import { resolvePresentation } from "./presentation.ts";
import { forgetTouch, noteTouch } from "./touch-point.ts";
import { topLayer, useSheetSubmit } from "./layers.ts";
import { SheetHost, useOptionalSheetHost } from "./SheetHost.tsx";

const touchAt = (pageX: number, pageY: number) => noteTouch({ nativeEvent: { pageX, pageY } });

afterEach(forgetTouch);

jest.setTimeout(20_000);

const LANDSCAPE = { width: 1376, height: 1032 };
const PHONE = { width: 402, height: 874 };
const OPTIONS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

function At({ size, children }: { size: { width: number; height: number }; children: ReactNode }) {
  return <WindowSizeProvider value={size}>{children}</WindowSizeProvider>;
}

function Picker(props: Partial<Parameters<typeof Sheet>[0]>) {
  const [open, setOpen] = useState(true);
  return (
    <View>
      <Text>{open ? "open" : "closed"}</Text>
      <Sheet open={open} onOpenChange={setOpen} title="Letter" {...props}>
        <OptionList label="Letter" options={OPTIONS} value="a" onChange={() => {}} />
      </Sheet>
    </View>
  );
}

const widthOf = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style).width;

// On a tablet the one sheet floats as the desktop's popovers and dialogs (D83, 2.1 to 2.4);
// a phone keeps the sheet and card it had.
describe("how a sheet shows by the window", () => {
  it("keeps the phone's sheet or card in a compact window", () => {
    for (const kind of ["picker", "menu", "form", "confirm", "flow"] as const) {
      expect(
        resolvePresentation({ windowClass: "compact", kind, anchored: true }).presentation,
      ).toBe("sheet");
    }
    expect(
      resolvePresentation({ windowClass: "compact", anchored: false, requested: "card" })
        .presentation,
    ).toBe("card");
  });

  it("anchors pickers and menus as popovers, everything else as dialogs, on a tablet", () => {
    const on = (kind: Parameters<typeof resolvePresentation>[0]["kind"], anchored: boolean) =>
      resolvePresentation({ windowClass: "medium", kind, anchored });
    expect(on("picker", true).presentation).toBe("popover");
    expect(on("menu", true).presentation).toBe("popover");
    expect(on("context", true).presentation).toBe("popover");
    expect(on("picker", false)).toEqual({ presentation: "dialog", dialog: "small" });
    expect(on("form", true)).toEqual({ presentation: "dialog", dialog: "medium" });
    expect(on("confirm", false)).toEqual({ presentation: "dialog", dialog: "small" });
    expect(on("flow", false)).toEqual({ presentation: "dialog", dialog: "large" });
  });

  it("shows a picker on its anchor without dimming, and a tap outside closes it", async () => {
    render(
      <At size={LANDSCAPE}>
        <Picker presentation="card" anchor={{ x: 300, y: 200, width: 160, height: 44 }} />
      </At>,
    );
    const popover = await screen.findByTestId("sheet-popover");
    expect(StyleSheet.flatten(popover.props.style)).toMatchObject({
      left: 300,
      top: 252,
      width: 320,
    });
    expect(screen.queryByTestId("sheet-panel")).toBeNull();
    expect(screen.queryByTestId("sheet-dialog")).toBeNull();
    // No title row on a popover: what it is, is said to a screen reader.
    expect(popover.props.accessibilityLabel).toBe("Letter");
    expect(screen.getByText("Alpha")).toBeTruthy();
    // A tap outside (hidden from VoiceOver, which closes it with its escape gesture).
    fireEvent.press(screen.getByLabelText("Close", { includeHiddenElements: true }));
    await waitFor(() => expect(screen.getByText("closed")).toBeTruthy());
  });

  it("opens a context menu beside the finger", async () => {
    render(
      <At size={LANDSCAPE}>
        <Picker kind="context" anchor={pointAnchor(1300, 500)} />
      </At>,
    );
    const placed = StyleSheet.flatten((await screen.findByTestId("sheet-popover")).props.style);
    // Kept 12 from the window's right edge.
    expect(placed.left).toBe(LANDSCAPE.width - 12 - 320);
  });

  it("shows a picker nothing anchors as a small dialog", async () => {
    render(
      <At size={LANDSCAPE}>
        <Picker presentation="card" />
      </At>,
    );
    await screen.findByTestId("sheet-dialog");
    expect(widthOf("sheet-dialog")).toBe(420);
    expect(screen.getByRole("header", { name: "Letter" })).toBeTruthy();
  });

  it("sizes dialogs by what they hold, never wider than the window less 24 a side", async () => {
    const { unmount } = render(
      <At size={LANDSCAPE}>
        <Picker kind="form" />
      </At>,
    );
    await screen.findByTestId("sheet-dialog");
    expect(widthOf("sheet-dialog")).toBe(560);
    unmount();
    render(
      <At size={{ width: 700, height: 1000 }}>
        <Picker size="large" />
      </At>,
    );
    await screen.findByTestId("sheet-dialog");
    expect(widthOf("sheet-dialog")).toBe(700 - 48);
  });

  it("floats a popover over the dialog its field sits in", async () => {
    function Form() {
      const [inner, setInner] = useState(true);
      return (
        <Sheet open onOpenChange={() => {}} title="New Task" kind="form">
          <Sheet
            open={inner}
            onOpenChange={setInner}
            title="Status"
            anchor={{ x: 400, y: 300, width: 120, height: 44 }}
          >
            <Text>Todo</Text>
          </Sheet>
        </Sheet>
      );
    }
    render(
      <At size={LANDSCAPE}>
        <Form />
      </At>,
    );
    await screen.findByTestId("sheet-dialog");
    await screen.findByTestId("sheet-popover");
    expect(screen.getByText("Todo")).toBeTruthy();
  });

  it("closes with VoiceOver's escape gesture", async () => {
    render(
      <At size={LANDSCAPE}>
        <Picker kind="form" />
      </At>,
    );
    fireEvent(await screen.findByTestId("sheet-dialog"), "accessibilityEscape");
    await waitFor(() => expect(screen.getByText("closed")).toBeTruthy());
  });

  it("opens a menu where the finger went down when nothing names its anchor", async () => {
    function Opener() {
      const host = useOptionalSheetHost();
      return (
        <Text
          onPress={() =>
            host?.menu("Task", [{ label: "Delete Task", onPress: () => {} }], { kind: "context" })
          }
        >
          open
        </Text>
      );
    }
    render(
      <At size={LANDSCAPE}>
        <SheetHost>
          <Opener />
        </SheetHost>
      </At>,
    );
    touchAt(500, 400);
    fireEvent.press(screen.getByText("open"));
    const placed = StyleSheet.flatten((await screen.findByTestId("sheet-popover")).props.style);
    expect(placed).toMatchObject({ left: 500, top: 408 });
  });

  it("still shows a form as a dialog after a touch", async () => {
    touchAt(500, 400);
    render(
      <At size={LANDSCAPE}>
        <Picker />
      </At>,
    );
    await screen.findByTestId("sheet-dialog");
    expect(screen.queryByTestId("sheet-popover")).toBeNull();
  });

  it("closes the newest with Escape and presses its main button with Command Return", async () => {
    const sent = jest.fn();
    function Send() {
      useSheetSubmit(sent);
      return <Text>form</Text>;
    }
    function Form() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Text>{open ? "open" : "closed"}</Text>
          <Sheet open={open} onOpenChange={setOpen} title="New Task" kind="form">
            <Send />
          </Sheet>
        </>
      );
    }
    render(
      <At size={LANDSCAPE}>
        <Form />
      </At>,
    );
    await screen.findByTestId("sheet-dialog");
    topLayer()?.submit?.();
    expect(sent).toHaveBeenCalledTimes(1);
    act(() => topLayer()?.close());
    await waitFor(() => expect(screen.getByText("closed")).toBeTruthy());
    await waitFor(() => expect(topLayer()).toBeUndefined());
  });

  it("takes no keys on a phone", async () => {
    render(
      <At size={PHONE}>
        <Picker />
      </At>,
    );
    await screen.findByTestId("sheet-panel");
    expect(topLayer()).toBeUndefined();
  });

  it("asks in a small dialog with the desktop's footer: Cancel, then the action", async () => {
    const trashed = jest.fn();
    function Opener() {
      const host = useOptionalSheetHost();
      return (
        <Text
          onPress={() =>
            host?.confirm({
              title: "Delete Work forever?",
              description: "It can't be undone.",
              actions: [{ label: "Delete Forever", destructive: true, onPress: trashed }],
            })
          }
        >
          ask
        </Text>
      );
    }
    render(
      <At size={LANDSCAPE}>
        <SheetHost>
          <Opener />
        </SheetHost>
      </At>,
    );
    fireEvent.press(screen.getByText("ask"));
    await screen.findByTestId("sheet-dialog");
    expect(widthOf("sheet-dialog")).toBe(420);
    const footer = screen.getByTestId("card-footer");
    expect(within(footer).getByRole("button", { name: "Cancel" })).toBeTruthy();
    fireEvent.press(within(footer).getByRole("button", { name: "Delete Forever" }));
    await waitFor(() => expect(trashed).toHaveBeenCalled());
  });

  it("closes when its anchor is gone", async () => {
    render(
      <At size={LANDSCAPE}>
        <Picker anchor={{ measure: async () => null }} />
      </At>,
    );
    await waitFor(() => expect(screen.getByText("closed")).toBeTruthy());
  });

  it("is still a sheet from the bottom on a phone", async () => {
    render(
      <At size={PHONE}>
        <Picker anchor={{ x: 10, y: 10, width: 40, height: 40 }} />
      </At>,
    );
    await screen.findByTestId("sheet-panel");
    expect(screen.queryByTestId("sheet-popover")).toBeNull();
  });
});
