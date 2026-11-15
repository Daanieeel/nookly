import { render, screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { Surface } from "../kit/Surface.tsx";
import { RADIUS } from "../tokens.ts";
import { Sheet } from "./Sheet.tsx";
import { SelectField } from "../SelectField.tsx";

// The calendar's box in a floating card (a date picker) had the small corners of a section,
// so it looked off inside the card's big round ones. Inside a card it rounds as much as the
// card does, less the card's margin around it.
describe("a surface's corners", () => {
  it("follow the card's corners inside a floating card", async () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Starts" presentation="card">
        <Surface>
          <Text>Calendar</Text>
        </Surface>
      </Sheet>,
    );
    expect(await screen.findByTestId("surface")).toHaveStyle({ borderRadius: RADIUS.inCard });
    expect(RADIUS.inCard).toBe(RADIUS.card - 8);
  });

  // The "Kind of link" select in the Relate card kept a section's small corners under the
  // round search bar. A field on its own rounds with the card too.
  it("a field on its own rounds with the card", async () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Relate to…" presentation="card">
        <SelectField
          label="Kind of link"
          value="a"
          options={[{ id: "a", label: "Related to" }]}
          onChange={() => {}}
        />
      </Sheet>,
    );
    expect(await screen.findByTestId("form-row")).toHaveStyle({ borderRadius: RADIUS.inCard });
  });

  it("keep a section's corners elsewhere", () => {
    render(
      <Surface>
        <Text>Calendar</Text>
      </Surface>,
    );
    expect(screen.getByTestId("surface")).toHaveStyle({ borderRadius: RADIUS.section });
  });
});

// The room under a dialog's close button was a third of the room above and beside it.
describe("a floating card's header", () => {
  it("has as much room under the close button as above and beside it", async () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Relate to…" presentation="card">
        <Text>Body</Text>
      </Sheet>,
    );
    const header = StyleSheet.flatten((await screen.findByTestId("card-header")).props.style);
    expect(header.paddingTop).toBeGreaterThan(0);
    expect(header.paddingBottom).toBe(header.paddingTop);
    expect(header.paddingRight).toBe(header.paddingTop);
  });
});
