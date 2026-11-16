import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Label } from "./kit/Label.tsx";
import { WindowSizeProvider } from "./pane.tsx";
import { Row } from "./Row.tsx";
import { Field } from "./Field.tsx";
import { useScale } from "./scale.ts";
import { TYPE } from "./tokens.ts";

const TABLET = { width: 1032, height: 1376 };

function Gutter() {
  return <Label>{String(useScale().gutter)}</Label>;
}

// The tablet is the desktop made for touch (D83, 3.1): the desktop's denser type and rows,
// never under the touch minimum, and the phone's scale untouched.
describe("the tablet's scale", () => {
  it("sets text at the desktop's size on a tablet and iOS's on a phone", () => {
    const tablet = render(
      <WindowSizeProvider value={TABLET}>
        <Label>Body</Label>
      </WindowSizeProvider>,
    );
    expect(StyleSheet.flatten(tablet.getByText("Body").props.style).fontSize).toBe(15);
    const phone = render(<Label>Body</Label>);
    expect(StyleSheet.flatten(phone.getByText("Body").props.style).fontSize).toBe(
      TYPE.body.fontSize,
    );
  });

  it("keeps rows at 44 on a tablet, the touch minimum", () => {
    const row = <Row title="Inbox" onPress={() => {}} />;
    const tablet = render(<WindowSizeProvider value={TABLET}>{row}</WindowSizeProvider>);
    const style = (r: ReturnType<typeof render>) =>
      StyleSheet.flatten(r.getByRole("button", { name: "Inbox" }).props.style);
    expect(style(tablet).minHeight).toBe(44);
    expect(style(render(row)).minHeight).toBe(52);
  });

  it("gives a tablet's pages the desktop's wider gutter", () => {
    const tablet = render(
      <WindowSizeProvider value={TABLET}>
        <Gutter />
      </WindowSizeProvider>,
    );
    expect(tablet.getByText("24")).toBeTruthy();
    expect(render(<Gutter />).getByText("16")).toBeTruthy();
  });

  it("draws a field at the touch minimum on a tablet", () => {
    const field = <Field label="Name" value="" onChangeText={() => {}} />;
    const tablet = render(<WindowSizeProvider value={TABLET}>{field}</WindowSizeProvider>);
    expect(StyleSheet.flatten(tablet.getByTestId("field-box").props.style).minHeight).toBe(44);
    expect(StyleSheet.flatten(render(field).getByTestId("field-box").props.style).minHeight).toBe(
      50,
    );
  });
});
