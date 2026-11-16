import { fireEvent, render, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { type Column, DataTable } from "./DataTable.tsx";
import { GroupWidthProvider, WindowSizeProvider } from "./pane.tsx";
import { Text } from "./Text.tsx";

interface Note {
  id: string;
  title: string;
  labels: string;
  edited: number;
}

const NOTES: Note[] = [
  { id: "a", title: "Budget", labels: "Work", edited: 2 },
  { id: "b", title: "Apples", labels: "Home", edited: 3 },
  { id: "c", title: "Courses", labels: "School", edited: 1 },
];

const COLUMNS: Column<Note>[] = [
  {
    id: "title",
    label: "Title",
    width: "fill",
    render: (n) => <Text>{n.title}</Text>,
    sortValue: (n) => n.title,
  },
  {
    id: "labels",
    label: "Labels",
    width: 140,
    hideBelow: 560,
    render: (n) => <Text>{n.labels}</Text>,
  },
  {
    id: "edited",
    label: "Edited",
    width: 100,
    align: "end",
    render: (n) => <Text>{`${n.edited} days ago`}</Text>,
    sortValue: (n) => n.edited,
  },
];

function table(width: number, props: Partial<Parameters<typeof DataTable<Note>>[0]> = {}) {
  return render(
    <WindowSizeProvider value={{ width: 1032, height: 1376 }}>
      <GroupWidthProvider value={width}>
        <DataTable
          label="Notes"
          rows={NOTES}
          columns={COLUMNS}
          keyOf={(n) => n.id}
          titleOf={(n) => n.title}
          onPress={() => {}}
          {...props}
        />
      </GroupWidthProvider>
    </WindowSizeProvider>,
  );
}

const order = (screen: ReturnType<typeof render>) =>
  screen
    .getAllByRole("button")
    .filter((b) => b.props.accessibilityHint === "Opens it")
    .map((b) => b.props.accessibilityLabel.split(",")[0]);

// The desktop's data table for a tablet's lists (3.3): column headers, sorting on a tap,
// rows at the touch height, and columns that give way in a narrow page, never scrolling
// sideways.
describe("a table on a tablet", () => {
  it("lists rows under their column headers, 44 tall", () => {
    const screen = table(900);
    for (const name of ["Title", "Edited"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
    // A column that cannot sort is a plain heading.
    expect(screen.getByText("Labels")).toBeTruthy();
    const row = screen.getByRole("button", { name: /^Budget/ });
    expect(StyleSheet.flatten(row.props.style).minHeight).toBe(44);
    expect(within(row).getByText("Work")).toBeTruthy();
  });

  it("sorts by a column on a tap, and the other way on a second", () => {
    const screen = table(900);
    fireEvent.press(screen.getByRole("button", { name: /^Title/ }));
    expect(order(screen)).toEqual(["Apples", "Budget", "Courses"]);
    expect(screen.getByRole("button", { name: "Title, sorted ascending" })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: /^Title/ }));
    expect(order(screen)).toEqual(["Courses", "Budget", "Apples"]);
    fireEvent.press(screen.getByRole("button", { name: /^Edited/ }));
    expect(order(screen)).toEqual(["Courses", "Budget", "Apples"]);
  });

  it("drops the columns that do not fit a narrow page", () => {
    const screen = table(500);
    expect(screen.queryByText("Labels")).toBeNull();
    expect(screen.queryByText("Work")).toBeNull();
    expect(screen.getByRole("button", { name: /^Edited/ })).toBeTruthy();
  });

  it("puts a row's other columns on a second line where only the title fits", () => {
    const screen = table(340);
    expect(screen.queryByRole("button", { name: /^Edited/ })).toBeNull();
    const row = screen.getByRole("button", { name: /^Budget/ });
    expect(within(row).getByText("2 days ago")).toBeTruthy();
  });

  it("marks the row shown beside the list", () => {
    const screen = table(900, { selected: "b" });
    expect(screen.getByRole("button", { name: /^Apples/ }).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});
