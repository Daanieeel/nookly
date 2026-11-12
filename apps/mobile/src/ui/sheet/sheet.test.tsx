import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { ChoiceProperty } from "../property-rows.tsx";
import { SelectField } from "../SelectField.tsx";
import { MIN_TOUCH, gapBetween, touchSlop } from "../touch.ts";
import { MenuList, SEPARATOR, menuGroups } from "./MenuList.tsx";
import { OptionList } from "./OptionList.tsx";
import { Sheet, useSheet } from "./Sheet.tsx";

// The sheet animates in and out on timers, which take longer when every suite runs at once.
jest.setTimeout(20_000);

const OPTIONS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

function Single() {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState<string | null>("a");
  return (
    <View>
      <Text>{`picked ${value}`}</Text>
      <Text>{open ? "open" : "closed"}</Text>
      <Sheet open={open} onOpenChange={setOpen} title="Letter">
        <OptionList label="Letter" options={OPTIONS} value={value} onChange={setValue} />
      </Sheet>
    </View>
  );
}

function Multiple() {
  const [values, setValues] = useState<string[]>([]);
  return (
    <Sheet open onOpenChange={() => {}} title="Letters">
      <OptionList
        label="Letters"
        multiple
        options={OPTIONS}
        values={values}
        onToggle={(id, on) => setValues((v) => (on ? [...v, id] : v.filter((x) => x !== id)))}
      />
    </Sheet>
  );
}

function Pushing() {
  const sheet = useSheet();
  return (
    <Text onPress={() => sheet?.push({ title: "Time", content: <Text>Pick a time</Text> })}>
      Next step
    </Text>
  );
}

describe("the sheet", () => {
  it("closes when one of a set is picked, with the choice kept", async () => {
    const screen = render(<Single />);
    expect(screen.getByRole("radio", { name: "Alpha" }).props.accessibilityState.checked).toBe(
      true,
    );
    fireEvent.press(screen.getByRole("radio", { name: "Beta" }));
    expect(screen.getByText("picked b")).toBeTruthy();
    expect(screen.getByText("closed")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Beta" })).toBeNull(), {
      timeout: 10_000,
    });
  });

  it("goes away with a tap on the page behind it", async () => {
    const screen = render(<Single />);
    // The page behind the sheet is hidden from screen readers while it is up.
    fireEvent.press(screen.getByLabelText("Close", { includeHiddenElements: true }));
    expect(screen.getByText("closed")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("radio", { name: "Alpha" })).toBeNull(), {
      timeout: 10_000,
    });
  });

  it("stays open while several of a set are ticked", () => {
    const screen = render(<Multiple />);
    fireEvent.press(screen.getByRole("checkbox", { name: "Alpha" }));
    fireEvent.press(screen.getByRole("checkbox", { name: "Beta" }));
    expect(screen.getByRole("checkbox", { name: "Alpha" }).props.accessibilityState.checked).toBe(
      true,
    );
    expect(screen.getByRole("checkbox", { name: "Beta" }).props.accessibilityState.checked).toBe(
      true,
    );
  });

  it("pushes a step onto the same sheet, with a way back", async () => {
    const screen = render(
      <Sheet open onOpenChange={() => {}} title="Due date">
        <Pushing />
      </Sheet>,
    );
    fireEvent.press(screen.getByText("Next step"));
    expect(await screen.findByText("Pick a time")).toBeTruthy();
    expect(screen.getByText("Time")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Next step")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});

/// More choices than a compact menu holds, so they open in the sheet.
const MANY = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota"].map(
  (label) => ({ id: label.toLowerCase(), label }),
);

describe("a field inside a sheet", () => {
  it("opens a long list of choices as a step of the same sheet, and goes back to the form on a pick", async () => {
    function Form() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <Sheet open onOpenChange={() => {}} title="New Task">
          <SelectField label="Letter" value={value} options={MANY} onChange={setValue} />
        </Sheet>
      );
    }
    const screen = render(<Form />);
    fireEvent.press(screen.getByRole("button", { name: "Letter, Choose…" }));
    // The form steps aside for the choices; there is one sheet with a way back.
    expect(await screen.findByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.queryByText("New Task")).toBeNull();
    fireEvent.press(screen.getByRole("radio", { name: "Beta" }));
    expect(await screen.findByRole("button", { name: "Letter, Beta" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  // A few choices (priority, size, status) open as a compact menu at the field, the
  // desktop's dropdown, not as a step of the sheet.
  it("opens a few choices as a menu at the field, over the form", async () => {
    function Form() {
      const [value, setValue] = useState<string | null>(null);
      return (
        <Sheet open onOpenChange={() => {}} title="New Task">
          <SelectField label="Letter" value={value} options={OPTIONS} onChange={setValue} />
        </Sheet>
      );
    }
    const screen = render(<Form />);
    fireEvent.press(screen.getByRole("button", { name: "Letter, Choose…" }));
    expect(await screen.findByLabelText("Letter choices")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByText("New Task")).toBeTruthy();
    fireEvent.press(screen.getByRole("radio", { name: "Beta" }));
    expect(await screen.findByRole("button", { name: "Letter, Beta" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText("Letter choices")).toBeNull());
  });
});

describe("a menu in the sheet", () => {
  it("keeps the desktop's groups and puts destructive items last", () => {
    const groups = menuGroups([
      { label: "Pin" },
      { label: "Move to Trash", destructive: true },
      SEPARATOR,
      { label: "Copy Link" },
    ]);
    expect(groups.map((g) => g.map((i) => i.label))).toEqual([
      ["Pin"],
      ["Copy Link"],
      ["Move to Trash"],
    ]);
  });

  it("runs an action once the sheet has gone", async () => {
    const run = jest.fn();
    function Menu() {
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <MenuList entries={[{ label: "Pin", onPress: run }]} />
        </Sheet>
      );
    }
    const screen = render(<Menu />);
    fireEvent.press(screen.getByRole("menuitem", { name: "Pin" }));
    expect(run).not.toHaveBeenCalled();
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1), { timeout: 10_000 });
  });
});

describe("touch sizes", () => {
  it("grow a control to the platform's smallest target, and only where it falls short", () => {
    expect(touchSlop(32)).toEqual({
      top: (MIN_TOUCH - 32) / 2,
      bottom: (MIN_TOUCH - 32) / 2,
      left: (MIN_TOUCH - 32) / 2,
      right: (MIN_TOUCH - 32) / 2,
    });
    expect(touchSlop(32, 120)).toMatchObject({ left: 0, right: 0 });
    expect(touchSlop(60)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it("keep neighbours far enough apart that their hit areas never overlap", () => {
    const slop = touchSlop(28).right ?? 0;
    expect(gapBetween(28)).toBeGreaterThanOrEqual(2 * slop);
  });
});

describe("a compact menu", () => {
  // The desktop's property popovers have a search field and show each choice's icon and
  // details; the phone's keep them, however few the choices.
  it("can be searched, and shows each choice's details", async () => {
    function Field() {
      const [value, setValue] = useState<string>("a");
      return (
        <ChoiceProperty
          label="Status"
          value={value}
          onChange={setValue}
          searchPlaceholder="Change status…"
          options={[
            { id: "a", label: "Alpha", detail: "Mon, Nov 9" },
            { id: "b", label: "Beta" },
          ]}
        />
      );
    }
    const screen = render(<Field />);
    fireEvent.press(screen.getByRole("button", { name: "Status, Alpha" }));
    expect(await screen.findByLabelText("Status choices")).toBeTruthy();
    expect(screen.getByText("Mon, Nov 9")).toBeTruthy();
    fireEvent.changeText(screen.getByPlaceholderText("Change status…"), "bet");
    expect(screen.queryByRole("radio", { name: "Alpha" })).toBeNull();
    fireEvent.press(screen.getByRole("radio", { name: "Beta" }));
    expect(await screen.findByRole("button", { name: "Status, Beta" })).toBeTruthy();
  });
});
