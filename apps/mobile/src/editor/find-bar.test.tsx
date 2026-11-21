import { fireEvent, render, screen } from "@testing-library/react-native";
import { type StyleProp, StyleSheet, type ViewStyle } from "react-native";
import { FindBar } from "./FindBar.tsx";

const raised = (node: { props: { style?: StyleProp<ViewStyle> } }) => {
  const { boxShadow } = StyleSheet.flatten(node.props.style);
  return Array.isArray(boxShadow) && boxShadow.length > 0;
};

// The find bar over a page is drawn like the rest of the app: a raised bar holding a raised
// field and raised round buttons, not bare icons on the page.
describe("the find bar", () => {
  it("is a raised bar of raised buttons, with the count in a badge", () => {
    render(<FindBar result={{ count: 3, index: 1 }} onFind={() => {}} onStep={() => {}} />);
    expect(raised(screen.getByTestId("find-bar"))).toBe(true);
    expect(raised(screen.getByTestId("search-field"))).toBe(true);
    for (const name of ["Previous Match", "Next Match", "Close Find"]) {
      expect(raised(screen.getByRole("button", { name }))).toBe(true);
    }
    fireEvent.changeText(screen.getByLabelText("Find in Page"), "lecture");
    expect(screen.getByText("1 of 3")).toBeTruthy();
  });
});
