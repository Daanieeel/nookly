import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { PillSelect } from "./Compose.tsx";

const Mark = () => <Text>mark</Text>;

// A choice's icon showed in its list but not on the pill once picked (a season's sun or
// snowflake on the New Semester sheet): the pill kept the property's own icon.
describe("a pill select", () => {
  it("shows the chosen option's icon", () => {
    render(
      <PillSelect
        label="Term"
        value="summer"
        options={[
          { id: "winter", label: "Winter" },
          { id: "summer", label: "Summer", glyph: Mark, tint: "yellow" },
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Term, Summer" })).toBeTruthy();
    expect(screen.getByText("mark")).toBeTruthy();
  });
});
