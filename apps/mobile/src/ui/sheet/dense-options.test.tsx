import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { OptionList } from "./OptionList.tsx";

const LABELS = [
  { id: "a", label: "Urgent" },
  { id: "b", label: "Reading" },
];

const heightOf = (name: string) =>
  StyleSheet.flatten(screen.getByRole("checkbox", { name }).props.style).minHeight;

// The labels of an item are a long list of short words: at the picker's full row height it
// took a lot of scrolling. Dense rows are shorter, though never under a fingertip.
describe("a dense option list", () => {
  it("draws its rows shorter, at the touch minimum", () => {
    render(<OptionList label="Labels" multiple values={[]} options={LABELS} onToggle={() => {}} />);
    const full = heightOf("Urgent");
    screen.unmount();
    render(
      <OptionList label="Labels" multiple dense values={[]} options={LABELS} onToggle={() => {}} />,
    );
    expect(heightOf("Urgent")).toBeLessThan(full);
    expect(heightOf("Urgent")).toBe(44);
  });
});
