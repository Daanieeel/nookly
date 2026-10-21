import { act } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import type { ReactTestInstance } from "react-test-renderer";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { createRelationship, createSpace, createTask } from "@nookly/shared/data";
import { Stack } from "expo-router";
import { SidebarDrawer } from "./SidebarDrawer.tsx";
import { EntityScreen } from "../screens/EntityScreen.tsx";
import { RecordingMenu } from "../test/menu.ts";
import { pressBarButton, renderScreens, testData } from "../test/render.tsx";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";

async function setup() {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  const task = await createTask(data.db, space, "Write report");
  const other = await createTask(data.db, space, "Send report");
  await createRelationship(data.db, task, other, "blocks");
  return { data, task };
}

/// An open item inside the app's frame, as on a phone: the sidebar and the details both
/// wait behind the whole stack.
async function renderItem(menu?: RecordingMenu, at?: string) {
  const { data, task } = await setup();
  const screen = await renderScreens(
    {
      _layout: () => (
        <SidebarDrawer enabled edgeBack>
          <Stack screenOptions={{ headerShown: false }} />
        </SidebarDrawer>
      ),
      index: () => <Text>Home</Text>,
      "entity/[id]": () => <EntityScreen id={task} />,
    },
    data,
    at ?? `/entity/${task}`,
    { menu, width: 390 },
  );
  await screen.findByTestId("details-page");
  // An open item fills the details with its own (what it is linked to).
  if (!at) await screen.findByText("Send report", { includeHiddenElements: true });
  return screen;
}

const swipe = (id: string, translationX: number) =>
  act(() => {
    fireGestureHandler(getByGestureTestId(id), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: translationX / 2 },
      { state: State.END, translationX, velocityX: translationX * 5 },
    ]);
  });

const behind = { includeHiddenElements: true };

interface NativeBarItem {
  accessibilityLabel?: string;
  icon?: unknown;
  onPress: () => void;
}

/// What a drawer's pan was set up with: the parts these tests read.
interface PanConfig {
  enabled?: boolean;
  activeOffsetXStart?: number;
  activeOffsetXEnd?: number;
  failOffsetXStart?: number;
  failOffsetXEnd?: number;
  hitSlop?: { left?: number };
}

function panConfig(id: string): PanConfig {
  // SAFETY: the drawers' pans are Pan gestures, whose config carries these fields.
  return getByGestureTestId(id).config as PanConfig;
}

describe("the details of an item on a phone", () => {
  it("wait behind the page, and the menu brings them out", async () => {
    const menu = new RecordingMenu();
    const screen = await renderItem(menu);
    await pressBarButton(screen, "More");
    expect(menu.labels()[0]).toBe("Show Details");
    // The details are in the tree behind the page, with what the item is linked to.
    // (Closed, the drawer hides them from screen readers, as it should.)
    expect(await screen.findByText("Send report", behind)).toBeTruthy();
    expect(screen.getByLabelText("Details", behind)).toBeTruthy();
  });

  it("do not repeat on the page: its links are only in the details", async () => {
    const screen = await renderItem();
    // Once, in the details behind the page.
    expect(await screen.findAllByText("Related", behind)).toHaveLength(1);
  });

  it("slide the whole page aside, its bar too, rounded like the sidebar's page", async () => {
    const screen = await renderItem();
    const page = await screen.findByTestId("details-page");
    // The page holds the whole stack, so the item's bar goes with it.
    expect(page.findAll((node) => node.props.accessibilityLabel === "Details")).toHaveLength(0);
    const style = StyleSheet.flatten(page.props.style);
    expect(style.borderRadius).toBeGreaterThan(0);
    expect(style.borderTopLeftRadius).toBeUndefined();
    expect(style.borderTopRightRadius).toBeUndefined();
  });

  it("keep the info and more buttons where they were, over the details, in a bar of their own", async () => {
    const menu = new RecordingMenu();
    const screen = await renderItem(menu);
    await pressBarButton(screen, "Show Details");
    // The system draws them: they are items of a native bar over the details.
    const details = screen.getByLabelText("Details", behind);
    const own = (label: string) => {
      const items: NativeBarItem[] = details
        .findAll((node) => Array.isArray(node.props.headerRightBarButtonItems))
        .flatMap((node) => node.props.headerRightBarButtonItems);
      return items.find((item) => item.accessibilityLabel === label);
    };
    // The desktop's Tabler icons, tinted by the bar like its own.
    expect(own("Hide Details")?.icon).toEqual({
      type: "templateSource",
      templateSource: TOOLBAR_ICONS.hideDetails,
    });
    expect(own("More")?.icon).toEqual({
      type: "templateSource",
      templateSource: TOOLBAR_ICONS.more,
    });
    await act(async () => own("More")?.onPress());
    expect(menu.labels()).toContain("Copy Link");
    await act(async () => own("Hide Details")?.onPress());
    await pressBarButton(screen, "Show Details");
  });

  it("show the details' black behind the page's rounded corners, not the sidebar's page", async () => {
    const screen = await renderItem();
    const page = await screen.findByTestId("details-page");
    const details = screen.getByLabelText("Details", behind);
    // jest's theme has no real colors, so this follows the layers: the first one with a
    // background behind the page must be the details' own, not the sidebar's page around them.
    const layerBehind = (node: ReactTestInstance) => {
      for (let at = node.parent; at; at = at.parent) {
        // The page's own component, around the view the test id lands on, is the page.
        if (at.props.testID === node.props.testID) continue;
        if (StyleSheet.flatten(at.props.style)?.backgroundColor) return at;
      }
      return null;
    };
    const layer = layerBehind(page);
    expect(layer).not.toBe(screen.getByTestId("sidebar-page"));
    expect(layer?.findAll((node) => node === details)).toHaveLength(1);
  });

  it("draw the page's outline and shadow onto the details, as the sidebar does", async () => {
    const screen = await renderItem();
    const details = screen.getByLabelText("Details", behind);
    const edges = screen.getAllByTestId("page-edge", behind);
    // One under the sidebar, one under the details, which follows the page to the left.
    expect(edges).toHaveLength(2);
    expect(edges.filter((edge) => details.findAll((node) => node === edge).length)).toHaveLength(1);
  });

  it("the info button in the bar slides the page aside to the details, and back", async () => {
    const screen = await renderItem();
    // The drawer's own animation does the sliding; here the button follows its state.
    await pressBarButton(screen, "Show Details");
    await pressBarButton(screen, "Hide Details");
    await pressBarButton(screen, "Show Details");
  });

  it("a swipe to the left brings the details out, a swipe to the right sends them back", async () => {
    const screen = await renderItem();
    swipe("details-swipe", -200);
    await pressBarButton(screen, "Hide Details");
    swipe("details-swipe", 200);
    await pressBarButton(screen, "Show Details");
  });

  it("are not there to swipe out on a page without an item", async () => {
    await renderItem(undefined, "/");
    expect(panConfig("details-swipe").enabled).toBe(false);
  });

  // The gesture handler reads a range as [how far left, how far right] the finger may go
  // before the pan starts (or fails), the left one at most 0 and the right one at least 0.
  // The drawers once passed [16, 10_000] and [-10_000, -5]: both pans then started at the
  // first move in any direction and took every swipe, which jest never noticed, as it fires
  // the gesture events itself and never checks the offsets.
  it("each drawer takes only the swipe that opens it, and leaves the other one alone", async () => {
    await renderItem();
    const sidebar = panConfig("sidebar-swipe");
    // A drag to the right past the slop opens the sidebar, a drag to the left never does.
    expect(sidebar.activeOffsetXEnd).toBe(16);
    expect(sidebar.activeOffsetXStart).toBe(-10_000);
    expect(sidebar.failOffsetXStart).toBe(-16);
    // The first points of a page you can go back from stay with the system's back swipe.
    expect(sidebar.hitSlop?.left).toBe(-24);
    const details = panConfig("details-swipe");
    // The details the other way around.
    expect(details.activeOffsetXStart).toBe(-16);
    expect(details.activeOffsetXEnd).toBe(10_000);
    expect(details.failOffsetXEnd).toBe(16);
  });
});
