import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { Surface } from "../kit/Surface.tsx";
import { RADIUS } from "../tokens.ts";
import { Sheet } from "./Sheet.tsx";

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

  it("keep a section's corners elsewhere", () => {
    render(
      <Surface>
        <Text>Calendar</Text>
      </Surface>,
    );
    expect(screen.getByTestId("surface")).toHaveStyle({ borderRadius: RADIUS.section });
  });
});
