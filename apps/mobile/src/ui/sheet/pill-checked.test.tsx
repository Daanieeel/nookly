import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { PRIMARY, PRIMARY_GLOSS } from "../tokens.ts";
import { Pill } from "./Compose.tsx";

// A tint of the accent with accent words on it is dark and washed out, in the dark especially.
// A switched on pill (All day) is filled with the accent and its words are white, so it reads
// at a glance.
describe("a switched on pill", () => {
  it("looks like the default badge: the accent with its gloss, and white words", () => {
    render(<Pill label="All day" value={null} checked onPress={() => {}} />);
    const pill = StyleSheet.flatten(screen.getByRole("switch", { name: "All day" }).props.style);
    const words = StyleSheet.flatten(screen.getByText("All day").props.style);
    expect(pill.backgroundColor).toBe(PRIMARY);
    // The default badge's gloss, ring and shadows.
    expect(pill.experimental_backgroundImage).toBe(PRIMARY_GLOSS.experimental_backgroundImage);
    expect(pill.boxShadow).toEqual(PRIMARY_GLOSS.boxShadow);
    expect(words.color).toBe("#ffffff");
  });
});
