import { fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { ActiveFilters, operatorOf } from "./ActiveFilters.tsx";
import type { ListFilter } from "./ListControls.tsx";

const due = (values: string[], onChange = jest.fn()): ListFilter => ({
  label: "Due date",
  options: [
    { id: "overdue", label: "Overdue" },
    { id: "today", label: "Due today" },
    { id: "week", label: "Next 7 days" },
    { id: "none", label: "No due date" },
  ],
  values,
  onChange,
});

// Many filters crowded the page with one chip per value (the user's screenshot). As on the
// desktop, each field is one chip: its name, how it matches, what it matches, and a way off.
describe("active filters", () => {
  it("shows one chip per field, read like the desktop's", () => {
    const screen = render(<ActiveFilters filters={[due(["overdue", "today"])]} />);
    expect(screen.getAllByTestId("filter-chip")).toHaveLength(1);
    expect(screen.getByText("Due date")).toBeTruthy();
    expect(screen.getByText("is any of")).toBeTruthy();
    expect(screen.getByText("Overdue, Due today")).toBeTruthy();
  });

  it("reads one value as is, and most of them as is not the rest", () => {
    expect(operatorOf(due(["today"]))).toEqual({ negated: false, shown: ["today"] });
    expect(operatorOf(due(["overdue", "today", "week"]))).toEqual({
      negated: true,
      shown: ["none"],
    });
    const screen = render(<ActiveFilters filters={[due(["overdue", "today", "week"])]} />);
    expect(screen.getByText("is not")).toBeTruthy();
    expect(screen.getByText("No due date")).toBeTruthy();
  });

  it("flips is and is not with a tap on how it matches", () => {
    const onChange = jest.fn();
    const screen = render(<ActiveFilters filters={[due(["today"], onChange)]} />);
    fireEvent.press(
      screen.getByRole("button", { name: "Due date is Due today. Switch to is not" }),
    );
    expect(onChange).toHaveBeenCalledWith(["overdue", "week", "none"]);
  });

  // The Tasks page's Due date filter held half of its choices (Overdue, Due today, Next 7
  // days of six): a tap on "is any of" swapped them for the other half but still read "is any
  // of", so the tap looked dead. An even split reads the way it was last turned.
  it("reads an even split the way it was last turned", () => {
    const six = (values: string[], onChange = jest.fn()): ListFilter => ({
      ...due(values, onChange),
      options: [...due([]).options, { id: "later", label: "Later" }, { id: "done", label: "Done" }],
    });
    let filter = six(["overdue", "today", "week"]);
    const onChange = jest.fn((next: string[]) => {
      filter = six(next, onChange);
    });
    filter = six(["overdue", "today", "week"], onChange);
    const screen = render(<ActiveFilters filters={[filter]} />);
    expect(screen.getByText("is any of")).toBeTruthy();
    fireEvent.press(
      screen.getByRole("button", {
        name: "Due date is any of Overdue, Due today, Next 7 days. Switch to is none of",
      }),
    );
    expect(onChange).toHaveBeenCalledWith(["none", "later", "done"]);
    screen.rerender(<ActiveFilters filters={[filter]} />);
    expect(screen.getByText("is none of")).toBeTruthy();
    expect(screen.getByText("Overdue, Due today, Next 7 days")).toBeTruthy();
  });

  it("takes a field's filter off", () => {
    const onChange = jest.fn();
    const screen = render(<ActiveFilters filters={[due(["today"], onChange)]} />);
    fireEvent.press(screen.getByRole("button", { name: "Remove Due date Filter" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("lays each chip out across the whole width, one under the other", () => {
    const screen = render(
      <ActiveFilters
        filters={[due(["today"]), { ...due(["none"]), label: "Created", options: due([]).options }]}
      />,
    );
    for (const chip of screen.getAllByTestId("filter-chip")) {
      expect(StyleSheet.flatten(chip.props.style).alignSelf).toBe("stretch");
    }
  });

  it("shows nothing while no filter is on", () => {
    const screen = render(<ActiveFilters filters={[due([])]} />);
    expect(screen.queryByTestId("filter-chip")).toBeNull();
  });
});
