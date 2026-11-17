import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  type GestureStateManager,
  type GestureTouchEvent,
  PointerType,
  State,
} from "react-native-gesture-handler";
import { getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { SidebarOverlay } from "./sidebar/SidebarOverlay.tsx";

/// Puts a pointer of `pointerType` down on the gesture `id`, and says how the gesture took it.
function touchDown(id: string, pointerType: PointerType) {
  const manager: GestureStateManager = {
    fail: jest.fn(),
    activate: jest.fn(),
    begin: jest.fn(),
    end: jest.fn(),
    handlerTag: 1,
  };
  const event: GestureTouchEvent = {
    pointerType,
    handlerTag: 1,
    numberOfTouches: 1,
    state: State.BEGAN,
    // Gesture Handler's `TouchEventType.TOUCHES_DOWN`, which it does not export.
    eventType: 1,
    allTouches: [],
    changedTouches: [],
  };
  getByGestureTestId(id).handlers.onTouchesDown?.(event, manager);
  return manager;
}

// Apple Pencil (10.5): Scribble writes into a text field with a stroke, which a pan over the
// field would take as a drag. The details pane over a narrow page holds fields and drags
// sideways to close: a Pencil stroke there is left to Scribble, a finger still drags it.
describe("the Pencil over the details pane", () => {
  beforeEach(() => {
    render(
      <SidebarOverlay
        open
        onOpenChange={() => {}}
        width={320}
        top={0}
        side="right"
        edgeTestId="edge-details"
      >
        <Text>Details</Text>
      </SidebarOverlay>,
    );
  });

  it("leaves a Pencil stroke to Scribble", () => {
    expect(touchDown("edge-details-drag", PointerType.STYLUS).fail).toHaveBeenCalled();
  });

  it("still drags it closed under a finger", () => {
    expect(touchDown("edge-details-drag", PointerType.TOUCH).fail).not.toHaveBeenCalled();
  });
});
