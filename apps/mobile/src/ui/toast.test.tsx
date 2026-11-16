import { act, fireEvent, render } from "@testing-library/react-native";
import { ToastHost } from "./ToastHost.tsx";
import { toast, useToasts } from "./toast.ts";

afterEach(() => act(() => useToasts.setState({ toasts: [], hosts: 0 })));

// The desktop's toasts (3.7), only for what leaves nothing on screen to show its result
// (a deleted row): at the bottom right of a tablet's window, with Undo where it can.
describe("a tablet's toasts", () => {
  it("says what happened, with its action and a way to dismiss it", () => {
    const undo = jest.fn();
    const screen = render(<ToastHost />);
    act(() =>
      toast({ title: 'Moved "Budget" to Trash', action: { label: "Undo", onPress: undo } }),
    );
    expect(screen.getByText('Moved "Budget" to Trash')).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Moved "Budget" to Trash')).toBeNull();
  });

  it("goes by itself after a few seconds, or when dismissed", () => {
    jest.useFakeTimers();
    const screen = render(<ToastHost />);
    act(() => toast({ title: "First" }));
    act(() => toast({ title: "Second" }));
    fireEvent.press(screen.getAllByRole("button", { name: "Dismiss" })[0]);
    expect(screen.queryByText("First")).toBeNull();
    act(() => jest.advanceTimersByTime(6000));
    expect(screen.queryByText("Second")).toBeNull();
    jest.useRealTimers();
  });

  it("is never kept where nothing shows it (a phone)", () => {
    act(() => toast({ title: "Nobody sees this" }));
    expect(useToasts.getState().toasts).toEqual([]);
  });
});
