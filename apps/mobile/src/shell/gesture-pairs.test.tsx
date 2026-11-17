import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { z } from "zod";
import { SwipeRow } from "../ui/SwipeRow.tsx";
import { EdgeBack } from "./EdgeBack.tsx";
import { SidebarOverlay } from "./sidebar/SidebarOverlay.tsx";

/// The parts of a pan's set up that decide who gets a touch.
const panConfig = z.object({
  activeOffsetXStart: z.number().optional(),
  activeOffsetXEnd: z.number().optional(),
  failOffsetYStart: z.number().optional(),
  failOffsetYEnd: z.number().optional(),
});
const configOf = (id: string) => panConfig.parse(getByGestureTestId(id).config);

// The gestures that share an edge of a tablet's page (10.4): the left edge goes back (or
// brings the sidebar in a medium window), the right edge brings the details over a narrow
// page, and a row in a list swipes either way for its actions. Gesture Handler gives a touch
// to whichever gesture starts first, so a swipe that begins on an edge must start the edge's
// gesture before the row's, and none of them may take a vertical drag from the list.
describe("gestures that share an edge", () => {
  beforeEach(() => {
    render(
      <EdgeBack width={800} canGoBack onBack={() => {}} behind={null}>
        <SidebarOverlay
          open={false}
          onOpenChange={() => {}}
          width={320}
          top={0}
          side="right"
          edgeTestId="edge-details"
        >
          <Text>Details</Text>
        </SidebarOverlay>
        <SwipeRow
          leading={[{ label: "Pin", tone: "warning", onPress: () => {} }]}
          trailing={[{ label: "Trash", tone: "destructive", onPress: () => {} }]}
        >
          <Text>Row</Text>
        </SwipeRow>
      </EdgeBack>,
    );
  });

  it("goes back, not into the row's actions, on a swipe right from the left edge", () => {
    const back = configOf("edge-back");
    const row = configOf("swipe-row");
    // Only rightward: a leftward swipe on the edge stays the row's.
    expect(back.activeOffsetXStart).toBeUndefined();
    expect(back.activeOffsetXEnd).toBeLessThan(row.activeOffsetXEnd ?? Infinity);
  });

  it("brings the details, not the row's actions, on a swipe left from the right edge", () => {
    const details = configOf("edge-details");
    const row = configOf("swipe-row");
    // Only leftward: a rightward swipe there stays the row's.
    expect(details.activeOffsetXEnd).toBeUndefined();
    expect(Math.abs(details.activeOffsetXStart ?? -Infinity)).toBeLessThan(
      Math.abs(row.activeOffsetXStart ?? -Infinity),
    );
  });

  it("leaves a vertical drag to the list", () => {
    for (const id of ["edge-back", "edge-details", "swipe-row"]) {
      const config = configOf(id);
      expect(config.failOffsetYStart).toBeGreaterThanOrEqual(-12);
      expect(config.failOffsetYEnd).toBeLessThanOrEqual(12);
    }
  });
});
