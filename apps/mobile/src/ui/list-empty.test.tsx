import { IconClipboardList } from "@tabler/icons-react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ListEmpty } from "./ListEmpty.tsx";

// Assignments said only "Nothing matches these filters." in muted text, with no way out. A
// list's empty states are the app's own: its icon and a title, and when filters hide
// everything a Clear Filters button under it.
describe("an empty list", () => {
  it("says nothing is there yet, with the module's icon", () => {
    render(
      <ListEmpty
        glyph={IconClipboardList}
        total={0}
        shown={0}
        nothingYet={{ title: "No Assignments", message: "Add them to a course." }}
        onClear={() => {}}
      />,
    );
    expect(
      screen.getByRole("summary", { name: "No Assignments. Add them to a course." }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear Filters" })).toBeNull();
  });

  it("offers to clear the filters that hide everything", () => {
    const onClear = jest.fn();
    render(
      <ListEmpty
        glyph={IconClipboardList}
        total={3}
        shown={0}
        nothingYet={{ title: "No Assignments" }}
        onClear={onClear}
      />,
    );
    expect(
      screen.getByRole("summary", { name: "No Matches. Nothing matches these filters." }),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Clear Filters" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("is nothing while the list shows something", () => {
    render(
      <ListEmpty
        glyph={IconClipboardList}
        total={3}
        shown={2}
        nothingYet={{ title: "x" }}
        onClear={() => {}}
      />,
    );
    expect(screen.queryByRole("summary")).toBeNull();
  });
});
