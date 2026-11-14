import { IconCalendarEvent } from "@tabler/icons-react-native";
import { render } from "@testing-library/react-native";
import { Property } from "./Property.tsx";
import { TINT } from "./tokens.ts";

describe("a property in a warning colour", () => {
  // A due date that has passed: its icon and its value in the same red.
  it("draws its icon in the value's colour", () => {
    const screen = render(
      <Property
        icon={<IconCalendarEvent size={20} color="#888888" />}
        label="Due date"
        value="Mon, Nov 9"
        valueTone="destructive"
      />,
    );
    const colors = screen.UNSAFE_getAllByType(IconCalendarEvent).map((icon) => icon.props.color);
    expect(colors).toEqual([TINT.red.light]);
  });
});
