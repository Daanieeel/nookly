import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  PanesProvider,
  type SwipeOpens,
  usePanes,
  useReportDetailsOpen,
  useSwipeOpens,
} from "./panes.tsx";

// What a swipe may open, as the two drawers read it, and the handles to open them.
interface Seen {
  swipe: SwipeOpens;
  panes: ReturnType<typeof usePanes>;
}
const seen: Seen = { swipe: { sidebar: true, details: true }, panes: null };

function Probe() {
  seen.swipe = useSwipeOpens();
  seen.panes = usePanes();
  return null;
}

function Details({ open }: { open: boolean }) {
  useReportDetailsOpen(open);
  return <Text>Details</Text>;
}

function page(details: boolean | null) {
  return (
    <PanesProvider>
      <Probe />
      {details === null ? null : <Details open={details} />}
    </PanesProvider>
  );
}

describe("the sidebar and the details around a page", () => {
  it("from the page, either can be swiped open", () => {
    render(page(false));
    expect(seen.swipe).toEqual({ sidebar: true, details: true });
  });

  it("with the details open, a swipe back goes to the page, not on to the sidebar", () => {
    const view = render(page(false));
    view.rerender(page(true));
    expect(seen.swipe).toEqual({ sidebar: false, details: true });
    view.rerender(page(false));
    expect(seen.swipe).toEqual({ sidebar: true, details: true });
  });

  it("with the sidebar open, a swipe back goes to the page, not on to the details", () => {
    render(page(false));
    act(() => seen.panes?.setSidebarOpen(true));
    expect(seen.swipe).toEqual({ sidebar: true, details: false });
    act(() => seen.panes?.setSidebarOpen(false));
    expect(seen.swipe).toEqual({ sidebar: true, details: true });
  });

  it("leaving an item with its details open does not lock the sidebar", () => {
    const view = render(page(true));
    expect(seen.swipe.sidebar).toBe(false);
    view.rerender(page(null));
    expect(seen.swipe.sidebar).toBe(true);
  });
});
