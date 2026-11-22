import { fireEvent, render } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { BrandButton } from "./BrandButton.tsx";
import { Button } from "./Button.tsx";
import { Chip } from "./Chips.tsx";
import { Field } from "./Field.tsx";
import { GlassButton } from "./GlassButton.tsx";
import { ConfirmContent } from "./sheet/Confirm.tsx";
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
      <SwipeRow
        leading={[{ label: "Done", tone: "positive", haptic: "complete", onPress: () => {} }]}
      >
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

  it("feels like what a button does: a thud to commit, a firm one for a consequence, a tick for the quiet ones", () => {
    const feel = (variant: ComponentProps<typeof Button>["variant"]) => {
      names.length = 0;
      clock += 10_000;
      jest.setSystemTime(clock);
      const screen = render(<Button label="Go" variant={variant} onPress={() => {}} />);
      fireEvent.press(screen.getByLabelText("Go"));
      screen.unmount();
      return names[0];
    };
    expect(feel("default")).toBe("detent");
    expect(feel("positive")).toBe("detent");
    expect(feel("secondary")).toBe("tap");
    expect(feel("ghost")).toBe("select");
    expect(feel("link")).toBe("select");
    expect(feel("warning")).toBe("edge");
    expect(feel("destructive")).toBe("edge");
    expect(feel("destructiveGhost")).toBe("edge");
  });

  it("presses without a haptic while a button is busy, and still runs the press once otherwise", () => {
    const onPress = jest.fn();
    const screen = render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText("Save"));
    expect(onPress).toHaveBeenCalledTimes(1);
    names.length = 0;
    screen.rerender(<Button label="Save" status="pending" onPress={onPress} />);
    fireEvent.press(screen.getByLabelText("Save"));
    expect(played()).toEqual([]);
  });

  it("warns as a confirmation with something dangerous in it opens, and stays quiet for a harmless one", () => {
    const harmless = { title: "Rename?", actions: [{ label: "Rename", onPress: () => {} }] };
    const render1 = render(<ConfirmContent confirmation={harmless} />);
    expect(played()).toEqual([]);
    render1.unmount();
    render(
      <ConfirmContent
        confirmation={{
          title: "Delete?",
          actions: [{ label: "Delete", destructive: true, onPress: () => {} }],
        }}
      />,
    );
    expect(played()).toEqual(["warning"]);
  });

  it("buzzes an error as a field turns invalid, once, and not for one that opens invalid", () => {
    const screen = render(<Field label="Email" value="" onChangeText={() => {}} />);
    expect(played()).toEqual([]);
    screen.rerender(
      <Field label="Email" value="x" error="Enter an email" onChangeText={() => {}} />,
    );
    expect(played()).toEqual(["error"]);
    // Still wrong, a different message: no second buzz.
    screen.rerender(
      <Field label="Email" value="xy" error="Not an email" onChangeText={() => {}} />,
    );
    expect(played()).toEqual(["error"]);
    // Fixed, then wrong again: it buzzes again.
    clock += 1_000;
    jest.setSystemTime(clock);
    screen.rerender(<Field label="Email" value="a@b.c" onChangeText={() => {}} />);
    screen.rerender(<Field label="Email" value="a@" invalid onChangeText={() => {}} />);
    expect(played()).toEqual(["error", "error"]);
    names.length = 0;
    render(<Field label="Email" value="" error="Already wrong" onChangeText={() => {}} />);
    expect(played()).toEqual([]);
  });

  it("feels different for showing a secret than for hiding it again", () => {
    const screen = render(
      <Field label="Password" secureTextEntry value="" onChangeText={() => {}} />,
    );
    fireEvent.press(screen.getByLabelText("Show password"));
    clock += 1_000;
    jest.setSystemTime(clock);
    fireEvent.press(screen.getByLabelText("Hide password"));
    expect(played()).toEqual(["toggle", "select"]);
  });

  it("ticks as a chip is chosen, and clicks for one of several that can be on at once", () => {
    const screen = render(
      <>
        <Chip label="Open" selected={false} onPress={() => {}} />
        <Chip label="Urgent" selected={false} multiple onPress={() => {}} />
      </>,
    );
    fireEvent.press(screen.getByLabelText("Open"));
    expect(played()).toEqual(["select"]);
    clock += 10_000;
    jest.setSystemTime(clock);
    fireEvent.press(screen.getByLabelText("Urgent"));
    expect(played()).toEqual(["select", "toggle"]);
  });

  it("taps as a round glass button or a service button is pressed", () => {
    const screen = render(
      <>
        <GlassButton label="Search" onPress={() => {}}>
          <Text>S</Text>
        </GlassButton>
        <BrandButton label="Sign In with Moodle" mark={<Text>M</Text>} onPress={() => {}} />
      </>,
    );
    fireEvent.press(screen.getByLabelText("Search"));
    expect(played()).toEqual(["tap"]);
  });
});
