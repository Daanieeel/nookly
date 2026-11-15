import { render, screen, within } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { Surface } from "../kit/Surface.tsx";
import { CARD_INSET, RADIUS, SPACE } from "../tokens.ts";
import { DialogActions, Sheet } from "./Sheet.tsx";
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
    expect(RADIUS.inCard).toBe(RADIUS.card - CARD_INSET);
  });

  // The "Kind of link" select in the Relate card took the card's big corners, nearly a pill,
  // and reached wider than the search bar above it. A field on its own in a card is a control
  // like that search bar: its corners, and its edges in line with it (both sit `CARD_INSET` in).
  it("a field on its own matches the search bar above it", async () => {
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
    const row = StyleSheet.flatten((await screen.findByTestId("form-row")).props.style);
    expect(row.borderRadius).toBe(RADIUS.control);
    expect(row.marginHorizontal ?? 0).toBe(0);
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

// The room under a dialog's close button was a third of the room above and beside it. With
// squircles the close button's corners and the card's no longer ran alongside each other, and
// the rows stood further left than the title.
describe("a floating card's header", () => {
  it("keeps one inset around the close button, its corners the card's less that inset", async () => {
    render(
      <Sheet open onOpenChange={() => {}} title="New" presentation="card">
        <Text>Body</Text>
      </Sheet>,
    );
    const header = StyleSheet.flatten((await screen.findByTestId("card-header")).props.style);
    expect(header.paddingTop).toBe(CARD_INSET);
    expect(header.paddingBottom).toBe(CARD_INSET);
    expect(header.paddingRight).toBe(CARD_INSET);
    const close = StyleSheet.flatten(screen.getByRole("button", { name: "Close" }).props.style);
    expect(close.borderRadius).toBe(RADIUS.card - CARD_INSET);
  });

  // A row pads its content 12pt in from its pressed shape, which starts `CARD_INSET` in.
  it("starts the title where the rows' content starts", async () => {
    render(
      <Sheet open onOpenChange={() => {}} title="New" presentation="card">
        <Text>Body</Text>
      </Sheet>,
    );
    const header = StyleSheet.flatten((await screen.findByTestId("card-header")).props.style);
    expect(header.paddingLeft).toBe(CARD_INSET + SPACE.md);
    const body = StyleSheet.flatten(
      (await screen.findByTestId("card-body")).props.contentContainerStyle,
    );
    expect(body.paddingHorizontal).toBe(CARD_INSET);
  });
});

// "Until a day" in Repeat grew the card past the screen and its Done button scrolled out of
// sight. A card's actions stay under its scrolling content, always in view.
describe("a floating card's actions", () => {
  it("stay below the scrolling content", async () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Repeat" presentation="card">
        <Text>Long content</Text>
        <DialogActions>
          <Text>Done</Text>
        </DialogActions>
      </Sheet>,
    );
    const footer = await screen.findByTestId("card-footer");
    expect(footer).toHaveTextContent("Done");
    expect(within(screen.getByTestId("card-body")).queryByText("Done")).toBeNull();
    const style = StyleSheet.flatten(footer.props.style);
    expect(style.paddingHorizontal).toBe(CARD_INSET);
    expect(style.paddingBottom).toBe(CARD_INSET);
  });
});
