import { Stack, usePathname } from "expo-router";
import { act, waitFor } from "expo-router/testing-library";
import { renderScreens } from "../test/render.tsx";
import { useIsTablet } from "../ui/pane.tsx";
import { setWindowOverride } from "../ui/window-override.ts";
import { useHandOver } from "./hand-over.ts";
import { newWorkspace } from "./workspace.ts";
import { useWorkspace, workspace } from "./workspace-store.ts";

let n = 0;
const ids = () => `h-${++n}`;

function Layout() {
  const tablet = useIsTablet();
  useHandOver(tablet, usePathname());
  return <Stack />;
}

afterEach(() => act(() => setWindowOverride(null)));

// A tablet window narrowed past 600 takes the phone's shell on the page its focused tab
// showed (0.7), which the router may not be on: tabs change without it.
describe("handing a narrowed window to the phone", () => {
  it("shows the focused tab's page", async () => {
    act(() => {
      useWorkspace.setState({ ws: newWorkspace(ids) });
      setWindowOverride({ width: 1376, height: 1032 });
    });
    const screen = await renderScreens({
      _layout: Layout,
      index: () => null,
      trash: () => null,
    });
    act(() => workspace.open("/trash"));
    expect(screen.getPathname()).toBe("/");
    act(() => setWindowOverride({ width: 375, height: 1133 }));
    await waitFor(() => expect(screen.getPathname()).toBe("/trash"));
  });
});
