import {
  createCourse,
  createSpace,
  createTask,
  listTasks,
  exportNooklyFile,
} from "@nookly/shared/data";
import { fireEvent, waitFor } from "expo-router/testing-library";
import { renderScreens, testData } from "../test/render.tsx";
import { FixedFilePicker } from "../test/menu.ts";
import { ImportScreen } from "./ImportScreen.tsx";

async function setup(text: string | null) {
  const data = testData();
  const space = await createSpace(data.db, "Work", "#0070f3");
  const course = await createCourse(data.db, space, "Algorithms");
  const picker = new FixedFilePicker(text);
  const screen = await renderScreens(
    { index: () => <ImportScreen spaceId={space} />, "entity/[id]": () => null },
    data,
    "/",
    { filePicker: picker },
  );
  return { ...screen, data, space, course };
}

describe("importing a Nookly file", () => {
  it("shows what a file holds before it makes anything, then makes it", async () => {
    const source = testData();
    const there = await createSpace(source.db, "Home", "#111111");
    await createTask(source.db, there, "Write the report");
    const { text } = await exportNooklyFile(source.db, (await listTasks(source.db))[0].entity.id);
    const screen = await setup(text);
    await fireEvent.press(await screen.findByRole("button", { name: "Choose File" }));
    expect(await screen.findByText("Write the report")).toBeTruthy();
    expect(screen.getByText("Status: Backlog")).toBeTruthy();
    expect(screen.getByText("0 subtasks")).toBeTruthy();
    // Nothing is made until it is asked for.
    expect(await listTasks(screen.data.db)).toHaveLength(0);
    await fireEvent.press(screen.getByRole("button", { name: "Import" }));
    await waitFor(async () => expect(await listTasks(screen.data.db)).toHaveLength(1));
    await waitFor(() => expect(screen.getPathname()).toMatch(/^\/entity\//));
  });

  it("says why a file cannot be read and makes nothing", async () => {
    const screen = await setup("not a nookly file");
    await fireEvent.press(await screen.findByRole("button", { name: "Choose File" }));
    expect(await screen.findByText("This is not a Nookly file.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
  });

  it("asks which course an assignment goes in", async () => {
    const file = JSON.stringify({
      format: "nookly-assignment",
      version: 1,
      kind: "assignment",
      title: "Sheet 1",
      course: "Some course",
      status: "not_started",
      dueDate: null,
      grade: null,
      weight: null,
      blocks: [],
    });
    const screen = await setup(file);
    await fireEvent.press(await screen.findByRole("button", { name: "Choose File" }));
    expect(await screen.findByText("From the course Some course")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Import" });
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(await screen.findByRole("radio", { name: "Algorithms" }));
    expect(screen.getByRole("button", { name: "Import" }).props.accessibilityState.disabled).toBe(
      false,
    );
  });
});
