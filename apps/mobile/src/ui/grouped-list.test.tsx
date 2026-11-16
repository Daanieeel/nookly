import { fireEvent, render } from "@testing-library/react-native";
import { GroupedList, type ListGroup } from "./GroupedList.tsx";
import { Text } from "./Text.tsx";

const GROUPS: ListGroup<string>[] = [
  { id: "todo", name: "Todo", items: ["Write", "Read"], subgroups: null },
  { id: "done", name: "Done", items: ["Sleep"], defaultCollapsed: true, subgroups: null },
];

const list = (groups = GROUPS, onCreate?: (group: string) => void) =>
  render(
    <GroupedList
      groups={groups}
      keyOf={(item) => item}
      renderRow={(item) => <Text>{item}</Text>}
      onCreateIn={onCreate ? (group) => () => onCreate(group.id) : undefined}
      createLabel={(name) => `New Task in ${name}`}
    />,
  );

// The desktop's grouped list (3.4): a header per group with how many it holds, folding the
// group away on a tap, finished work folded from the start.
describe("a grouped list", () => {
  it("heads each group with its name and count, done work folded", () => {
    const screen = list();
    const todo = screen.getByRole("button", { name: "Todo, 2" });
    expect(todo.props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByText("Write")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done, 1" }).props.accessibilityState).toMatchObject({
      expanded: false,
    });
    expect(screen.queryByText("Sleep")).toBeNull();
  });

  it("folds and unfolds a group on a tap", () => {
    const screen = list();
    fireEvent.press(screen.getByRole("button", { name: "Todo, 2" }));
    expect(screen.queryByText("Write")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "Done, 1" }));
    expect(screen.getByText("Sleep")).toBeTruthy();
  });

  it("nests sub groups under their group, leaving empty ones out", () => {
    const screen = list([
      {
        id: "todo",
        name: "Todo",
        items: ["Write"],
        subgroups: [
          { id: "high", name: "High", items: ["Write"], subgroups: null },
          { id: "low", name: "Low", items: [], subgroups: null },
        ],
      },
    ]);
    expect(screen.getByRole("button", { name: "High, 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Low/ })).toBeNull();
  });

  it("creates an item in a group from its header", () => {
    const made: string[] = [];
    const screen = list(GROUPS, (id) => made.push(id));
    fireEvent.press(screen.getByRole("button", { name: "New Task in Done" }));
    expect(made).toEqual(["done"]);
  });
});
