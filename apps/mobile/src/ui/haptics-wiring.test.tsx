import { fireEvent, render } from "@testing-library/react-native";
import { Button } from "./Button.tsx";
import { hapticOutput, patternOf } from "./haptics.ts";
import { PageTabs } from "./PageTabs.tsx";
import { Segmented } from "./Segmented.tsx";
import { OptionList } from "./sheet/OptionList.tsx";
import { SwipeRow } from "./SwipeRow.tsx";
import { Text } from "./Text.tsx";

const names: string[] = [];
const played = () => names;
const original = hapticOutput.play;
let clock = Date.now();

beforeAll(() => {
  hapticOutput.play = (events) => names.push(patternOf(events) ?? "?");
});
afterAll(() => {
  hapticOutput.play = original;
});
beforeEach(() => {
  names.length = 0;
  // Each test starts well clear of the last one's patterns, past every rate limit.
  clock += 10_000;
  jest.useFakeTimers({ now: clock, doNotFake: ["nextTick", "setImmediate"] });
});
afterEach(() => jest.useRealTimers());

describe("haptics in the controls", () => {
  it("ticks as a segment changes, and not for the one already chosen", () => {
    const screen = render(
      <Segmented
        label="Theme"
        value="light"
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        onChange={() => {}}
      />,
    );
    fireEvent.press(screen.getByLabelText("Light"));
    fireEvent.press(screen.getByLabelText("Dark"));
    expect(played()).toEqual(["select"]);
  });

  it("ticks as a tab changes", () => {
    const screen = render(
      <PageTabs
        label="Views"
        value="a"
        tabs={[
          { id: "a", label: "All" },
          { id: "b", label: "Mine" },
        ]}
        onChange={() => {}}
      />,
    );
    fireEvent.press(screen.getByLabelText("Mine"));
    expect(played()).toEqual(["select"]);
  });

  it("ticks as a choice is picked from a list", () => {
    const screen = render(
      <OptionList
        label="Status"
        value="todo"
        options={[
          { id: "todo", label: "To do" },
          { id: "done", label: "Done" },
        ]}
        onChange={() => {}}
      />,
    );
    fireEvent.press(screen.getByLabelText("Done"));
    expect(played()).toEqual(["select"]);
  });

  it("finishes a swipe action with its own pattern", () => {
    const screen = render(
      <SwipeRow left={{ label: "Done", tone: "positive", haptic: "complete", onPress: () => {} }}>
        <Text>Row</Text>
      </SwipeRow>,
    );
    const row = screen.UNSAFE_root.findAll((node) => node.props.onAccessibilityAction)[0];
    fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "Done" } });
    expect(played()).toEqual(["complete"]);
  });

  it("marks a button's result: success when it worked, error when it failed", () => {
    const screen = render(<Button label="Sync Now" status="pending" />);
    screen.rerender(<Button label="Sync Now" status="success" />);
    screen.rerender(<Button label="Sync Now" status="pending" />);
    screen.rerender(<Button label="Sync Now" status="error" />);
    expect(played()).toEqual(["success", "error"]);
  });
});
