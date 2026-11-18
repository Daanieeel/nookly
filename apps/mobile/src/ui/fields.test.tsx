import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { Field } from "./Field.tsx";
import { TINT, semantic, semanticHex } from "./tokens.ts";
import { FormSection } from "./kit/Form.tsx";
import { DayProperty, TextRow } from "./property-rows.tsx";
import { renderScreens, testData } from "../test/render.tsx";

/// The name of a field sits small above what is typed, never at the start of its line,
/// where it reads as a placeholder (the user's notes).
function nameAbove(screen: ReturnType<typeof render>, name: string, input: string) {
  const label = screen.getByText(name);
  const size = StyleSheet.flatten(label.props.style).fontSize;
  expect(size).toBeLessThan(17);
  const field = screen.getByLabelText(input);
  // The name's column holds the field under it.
  let column = label.parent;
  while (column && !column.findAll((n) => n === field).length) column = column.parent;
  expect(StyleSheet.flatten(column?.props.style)?.flexDirection ?? "column").toBe("column");
}

describe("a text field", () => {
  // A placeholder drawn in a see through grey let what is behind it show through; it is a
  // solid muted grey, as on the search field.
  it("draws its placeholder in a solid grey", () => {
    const screen = render(
      <Field label="Title" placeholder="Name" value="" onChangeText={() => {}} />,
    );
    expect(screen.getByLabelText("Title").props.placeholderTextColor).toEqual(
      semantic("placeholder", "light"),
    );
    expect(semanticHex("placeholder", "dark")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("has its name small above it", () => {
    const screen = render(<Field label="Title" value="" onChangeText={() => {}} />);
    nameAbove(screen, "Title", "Title");
  });

  it("may lead with an icon instead of a name", () => {
    const screen = render(
      <Field label="Title" icon={<Text>icon</Text>} value="" onChangeText={() => {}} />,
    );
    expect(screen.getByText("icon")).toBeTruthy();
    expect(screen.queryByText("Title")).toBeNull();
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });

  it("is focused by a tap anywhere on its row, its name included", () => {
    const screen = render(<Field label="Title" value="" onChangeText={() => {}} />);
    fireEvent.press(screen.getByText("Title"));
    expect(screen.getByLabelText("Title")).toBeTruthy();
  });
});

// The user found the plain filled field flat. A field on its own is a raised box with a
// hairline edge, as the desktop's input; focused, its edge and name take the accent.
describe("a field's box", () => {
  const box = (screen: ReturnType<typeof render>) =>
    StyleSheet.flatten(screen.getByTestId("field-box").props.style);

  it("is raised, with a hairline edge", () => {
    const screen = render(<Field label="Name" value="" onChangeText={() => {}} />);
    expect(box(screen).borderWidth).toBeGreaterThan(0);
    expect(box(screen).shadowOpacity).toBeGreaterThan(0);
  });

  it("takes the accent while focused, and lets go after", () => {
    const screen = render(<Field label="Name" value="" onChangeText={() => {}} />);
    const resting = box(screen).borderColor;
    fireEvent(screen.getByLabelText("Name"), "focus");
    expect(box(screen).borderColor).toBe(TINT.blue.light);
    expect(StyleSheet.flatten(screen.getByText("Name").props.style).color).toBe(TINT.blue.light);
    fireEvent(screen.getByLabelText("Name"), "blur");
    expect(box(screen).borderColor).toEqual(resting);
  });

  it("still calls the field's own focus and blur handlers", () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const screen = render(
      <Field label="Name" value="" onChangeText={() => {}} onFocus={onFocus} onBlur={onBlur} />,
    );
    fireEvent(screen.getByLabelText("Name"), "focus");
    fireEvent(screen.getByLabelText("Name"), "blur");
    expect(onFocus).toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });

  // Most forms hold one field in a section (New Space's name); it showed as a flat row.
  it("draws its box in a section of its own", () => {
    const screen = render(
      <FormSection title="Space">
        <Field label="Name" value="" onChangeText={() => {}} />
      </FormSection>,
    );
    expect(screen.getByTestId("field-box")).toBeTruthy();
    expect(screen.getByText("SPACE")).toBeTruthy();
  });

  it("is a grouped row among other rows", () => {
    const screen = render(
      <FormSection>
        <Field label="Username" value="" onChangeText={() => {}} />
        <Field label="Password" value="" onChangeText={() => {}} />
      </FormSection>,
    );
    expect(screen.queryByTestId("field-box")).toBeNull();
  });

  it("has a red edge with an error", () => {
    const screen = render(
      <Field label="Name" value="" onChangeText={() => {}} error="Give it a name." />,
    );
    expect(box(screen).borderColor).toBe(TINT.red.light);
    expect(screen.getByText("Give it a name.")).toBeTruthy();
  });
});

describe("a property typed in place", () => {
  it("has its name small above the value", () => {
    const screen = render(<TextRow label="Room" value="B12" onSave={() => {}} />);
    nameAbove(screen, "Room", "Room");
  });
});

describe("a time picked in a sheet", () => {
  it("is typed into a large clock face, with Clear in red and Done as the main button", async () => {
    const onChange = jest.fn();
    const screen = await renderScreens(
      {
        index: () => <DayProperty label="Time" mode="time" value="09:30" onChange={onChange} />,
      },
      testData(),
    );
    await fireEvent.press(await screen.findByRole("button", { name: /^Time/ }));
    const hour = await screen.findByLabelText("Time, hour");
    const style = Object.assign({}, ...[hour.props.style].flat(3).filter(Boolean));
    expect(style.fontSize).toBeGreaterThanOrEqual(48);
    expect(screen.getByTestId("Time, hour underline")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Clear Time" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("an empty time", () => {
  // An empty time read as midnight, so the clock showed 12 (or 00) before anything was typed.
  it("shows no hour until one is typed", async () => {
    const screen = await renderScreens(
      { index: () => <DayProperty label="Time" mode="time" value={null} onChange={jest.fn()} /> },
      testData(),
    );
    await fireEvent.press(await screen.findByRole("button", { name: /^Time/ }));
    expect((await screen.findByLabelText("Time, hour")).props.value).toBe("");
  });
});
