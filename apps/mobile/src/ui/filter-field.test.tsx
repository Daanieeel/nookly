import { render, screen } from "@testing-library/react-native";
import { FilterField } from "./ListBar.tsx";

// "Filter notes" above the Notes list was a plain boxed input, not the round search bar the
// rest of the app uses. Every list's filter field is that search bar.
describe("a list's filter field", () => {
  it("is the round search bar, with its clear button", () => {
    render(<FilterField label="Filter notes" value="grocer" onChange={() => {}} />);
    expect(screen.getByLabelText("Filter notes")).toBeTruthy();
    expect(screen.getByTestId("search-field")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear Search" })).toBeTruthy();
  });
});
