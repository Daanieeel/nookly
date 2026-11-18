import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { z } from "zod";
import Storage from "../test/kv-store.ts";
import { forgetPreferences, usePreference, writePreference } from "./preferences.ts";

const schema = z.object({ grouping: z.string() });
const FALLBACK = { grouping: "status" };

// Changing a list's filter or display was slow: every preference re-read the store and
// parsed it on every render, and any change re-rendered every list that remembers anything.
describe("a remembered preference", () => {
  beforeEach(() => forgetPreferences());

  it("re-renders only what shows the changed one", () => {
    let tasks = 0;
    let notes = 0;
    function Tasks() {
      tasks += 1;
      const [value] = usePreference("tasks.display", schema, FALLBACK);
      return <Text>{value.grouping}</Text>;
    }
    function Notes() {
      notes += 1;
      usePreference("notes.display", schema, FALLBACK);
      return null;
    }
    const screen = render(
      <>
        <Tasks />
        <Notes />
      </>,
    );
    act(() => writePreference("tasks.display", { grouping: "due" }));
    expect(screen.getByText("due")).toBeTruthy();
    expect(tasks).toBe(2);
    expect(notes).toBe(1);
  });

  it("reads the store once, and hands back the same value until it changes", () => {
    Storage.setItemSync("nookly.preference.tasks.display", JSON.stringify({ grouping: "due" }));
    const read = jest.spyOn(Storage, "getItemSync");
    const seen: unknown[] = [];
    function Tasks({ n }: { n: number }) {
      const [value] = usePreference("tasks.display", schema, FALLBACK);
      seen.push(value);
      return <Text>{`${value.grouping} ${n}`}</Text>;
    }
    const screen = render(<Tasks n={1} />);
    screen.rerender(<Tasks n={2} />);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).toEqual({ grouping: "due" });
    expect(read).toHaveBeenCalledTimes(1);
    read.mockRestore();
  });

  it("hands back the same value for a fallback written in place", () => {
    const seen: unknown[] = [];
    function Tasks({ n }: { n: number }) {
      const [value] = usePreference("tasks.display", schema, { grouping: "status" });
      seen.push(value);
      return <Text>{`${value.grouping} ${n}`}</Text>;
    }
    const screen = render(<Tasks n={1} />);
    screen.rerender(<Tasks n={2} />);
    expect(seen[0]).toBe(seen[1]);
  });

  it("keeps what is written in the store", () => {
    writePreference("tasks.display", { grouping: "due" });
    expect(Storage.getItemSync("nookly.preference.tasks.display")).toBe('{"grouping":"due"}');
  });
});
